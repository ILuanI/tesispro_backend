import 'reflect-metadata';
import { Body, Controller, Module, Post, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createHmac, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentsService } from '../src/modules/agents/agents.service.js';
import { PackagesService } from '../src/modules/admin/packages.service.js';
import { AttentionService } from '../src/modules/agents/attention.service.js';
import { AiService } from '../src/modules/ai/ai.service.js';
import { KnowledgeService } from '../src/modules/knowledge/knowledge.service.js';
import { WhatsAppModule } from '../src/modules/whatsapp/whatsapp.module.js';
import { WhatsAppCloudClient } from '../src/modules/whatsapp/whatsapp-cloud.client.js';
import { WhatsAppEventsService, type WhatsAppJob } from '../src/modules/whatsapp/whatsapp-events.service.js';
import { WhatsAppWorkerService } from '../src/modules/whatsapp/whatsapp-worker.service.js';

const dbUrl = process.env.WHATSAPP_TEST_DATABASE_URL;
const phone = '12345';
const sender = '10000000001';
const secondSender = '10000000002';
const appSecret = 'synthetic-app-secret';
const verifyToken = 'synthetic-verify-token-only-for-tests';
const workerSecret = 'synthetic-worker-token-only-for-tests';

@Controller('existing-json')
class ExistingJsonController {
  @Post() echo(@Body() body: unknown) { return body; }
}

function message(id: string, text = 'Hola', from = sender, ageSeconds = 0) {
  return { id, from, type: 'text', text: { body: text },
    timestamp: String(Math.floor(Date.now() / 1000) - ageSeconds) };
}
function change(messages: unknown[], number = phone, statuses: unknown[] = []) {
  return { field: 'messages', value: { metadata: { phone_number_id: number }, messages, statuses } };
}

describe.skipIf(!dbUrl)('WhatsApp with isolated PostgreSQL and simulated Meta', () => {
  let app: INestApplication;
  let control: DataSource;
  const schema = 'wa_' + randomBytes(8).toString('hex');
  let db: DataSource;
  let events: WhatsAppEventsService;
  let worker: WhatsAppWorkerService;
  let agent: AgentsService;
  const send = vi.fn<WhatsAppCloudClient['send']>();
  const aiFetch = vi.fn();
  const settings = {
    WHATSAPP_AI_MODE: 'off', WHATSAPP_AI_DAILY_LIMIT: '10',
    WHATSAPP_AI_OUTPUT_TOKENS: '128', WHATSAPP_AI_TIMEOUT_MS: '5000', WHATSAPP_ENABLED: 'true', WHATSAPP_PHONE_NUMBER_ID: phone, WHATSAPP_ACCESS_TOKEN: 'synthetic',
    WHATSAPP_APP_SECRET: appSecret, WHATSAPP_VERIFY_TOKEN: verifyToken,
    WHATSAPP_SESSION_KEY: Buffer.alloc(32, 1).toString('base64'),
    WHATSAPP_ALLOWED_SENDERS: [sender, secondSender].join(','), WHATSAPP_WORKER_SECRET: workerSecret,
  };

  beforeAll(async () => {
    const url = new URL(dbUrl!);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/whatsapp_test') {
      throw new Error('WhatsApp integration tests require a disposable local whatsapp_test database.');
    }
    const local = { type: 'postgres' as const, url: dbUrl, synchronize: false };
    control = await new DataSource(local).initialize();
    await control.query(`CREATE SCHEMA ${schema}`);
    const options = { ...local, schema, extra: { options: `-c search_path=${schema}` }, migrationsRun: true,
      migrations: [fileURLToPath(new URL('../dist/migrations/*.js', import.meta.url))] };
    @Module({ imports: [TypeOrmModule.forRoot(options), WhatsAppModule], controllers: [ExistingJsonController] })
    class TestRoot {}
    app = await NestFactory.create(TestRoot, { logger: false, rawBody: true });
    await app.init();
    db = app.get(DataSource);
    events = app.get(WhatsAppEventsService);
    worker = app.get(WhatsAppWorkerService);
    agent = app.get(AgentsService);
    app.get(WhatsAppCloudClient).send = send;
    app.get(AiService).options = (_budget, knowledge) => ({
      apiKey: 'synthetic', provider: 'openai', knowledge, fetchImpl: aiFetch,
    });
    await new KnowledgeService(db).bootstrap();
  }, 45_000);

  beforeEach(async () => {
    if (!db) return;
    for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
    send.mockReset().mockImplementation(async (_to, _body, ref) => ({ kind: 'accepted', id: 'out-' + ref }));
    aiFetch.mockReset().mockImplementation(async (_url: string, options: RequestInit) => {
      const call = JSON.parse(String(options.body));
      const value = call.text.format.name === 'agent_route'
        ? { agents: ['marketing'], clarify: false } : { tool: 'catalogo_publico' };
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(value) }] }] }));
    });
    await db.query('TRUNCATE whatsapp_ai_budget, whatsapp_outbound, whatsapp_event, whatsapp_session RESTART IDENTITY');
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await app?.close();
    if (control?.isInitialized) {
      await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await control.destroy();
    }
  });

  function webhook(changes: unknown[], signature?: string) {
    const json = JSON.stringify({ object: 'whatsapp_business_account',
      entry: changes.map(item => ({ changes: [item] })) }, null, 2);
    return request(app.getHttpServer()).post('/webhooks/whatsapp')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signature ?? 'sha256=' + createHmac('sha256', appSecret).update(json).digest('hex'))
      .send(json);
  }

  it('verifies GET, rejects invalid signatures, stays disabled, and keeps JSON parsing on other routes', async () => {
    const http = request(app.getHttpServer());
    const challenge = { 'hub.mode': 'subscribe', 'hub.verify_token': verifyToken, 'hub.challenge': '00123' };
    await http.get('/webhooks/whatsapp').query(challenge).expect(200, '00123').expect('Content-Type', /text\/plain/);
    await http.get('/webhooks/whatsapp').query({ ...challenge, 'hub.verify_token': 'invalid' }).expect(403);
    await http.get('/webhooks/whatsapp').query({ ...challenge, 'hub.mode': 'other' }).expect(403);
    await webhook([change([message('bad')])], 'sha256=' + '0'.repeat(64)).expect(403);
    expect(await db.query('SELECT id FROM whatsapp_event')).toHaveLength(0);
    vi.stubEnv('WHATSAPP_ENABLED', 'false');
    await http.get('/webhooks/whatsapp').query(challenge).expect(404);
    await webhook([change([message('disabled')])]).expect(404);
    await http.post('/internal/whatsapp/jobs/process').expect(404);
    await http.post('/existing-json').send({ nested: { count: 42 } }).expect(201, { nested: { count: 42 } });
    expect(await db.query('SELECT id FROM whatsapp_event')).toHaveLength(0);
  });

  it('persists a batch before processing, filters recipients and senders, and runs Tesi only once per event', async () => {
    const batch = [change([message('a'), message('b'), message('blocked','Hola','10000000003')]),
      change([message('wrong-number')], '98765'), change([message('c','Hola',secondSender)])];
    await webhook(batch).expect(200);
    await webhook(batch).expect(200);
    expect(send).not.toHaveBeenCalled();
    expect((await db.query('SELECT wamid FROM whatsapp_event ORDER BY id')).map((r: { wamid: string }) => r.wamid)).toEqual(['a','b','c']);
    const http = request(app.getHttpServer());
    await http.post('/internal/whatsapp/jobs/process').set('Authorization','Bearer wrong').expect(401);
    for (let n = 0; n < 3; n++) {
      await http.post('/internal/whatsapp/jobs/process').set('Authorization','Bearer ' + workerSecret)
        .expect(200, { processed: true });
    }
    expect(send).toHaveBeenCalledTimes(3);
    const rows = await db.query(`SELECT e.wamid,t.id_conversacion,c.canal FROM whatsapp_event e
      JOIN turno_tesi t ON t.id_turno=e.turn_id JOIN conversacion c USING(id_conversacion) ORDER BY e.id`);
    expect(rows).toHaveLength(3);
    expect(rows[0].id_conversacion).toBe(rows[1].id_conversacion);
    expect(rows[0].id_conversacion).not.toBe(rows[2].id_conversacion);
    expect(rows.every((row: { canal: string }) => row.canal === 'whatsapp')).toBe(true);
    expect(send.mock.calls[0][1]).toMatch(/Soy Tesi/);
  });

  it('excludes a second consumer for the same session while letting another session advance', async () => {
    await webhook([change([message('first'),message('second'),message('other','Hola',secondSender)])]).expect(200);
    const jobs = await Promise.all([events.claim(phone), events.claim(phone), events.claim(phone)]);
    const claimed = jobs.filter((job): job is WhatsAppJob => Boolean(job && job !== 'recovered'));
    expect(claimed).toHaveLength(2);
    expect(new Set(claimed.map(job => job.sender_id)).size).toBe(2);
    expect(await events.claim(phone)).toBeUndefined();
    const first = claimed.find(job => job.sender_id === sender)!;
    await db.query("UPDATE whatsapp_event SET lease_until=now()-interval '1 second' WHERE id=$1", [first.id]);
    const replacement = await events.claim(phone);
    expect(replacement).toMatchObject({ id: first.id, turn_id: first.turn_id, contact_token: first.contact_token });
    expect(await events.prepare(first, 'Resultado obsoleto', false)).toBeUndefined();
    expect(await events.startSend(first, false)).toBe(false);
    expect(replacement).not.toMatchObject({ lease_id: first.lease_id });
    const [stored] = await db.query('SELECT sealed_contact_token FROM whatsapp_session WHERE id=$1', [first.session_id]);
    expect(stored.sealed_contact_token).toBeTruthy();
    expect(stored.sealed_contact_token).not.toContain(first.contact_token);
  });

  it('recovers a committed agent turn after an expired worker lease', async () => {
    await webhook([change([message('recover')])]).expect(200);
    const job = await events.claim(phone);
    if (!job || job === 'recovered') throw new Error('Missing job');
    const { initialState } = await import('../src/modules/ai/state.js');
    const turn = await agent.turn({ idTurno: job.turn_id, message: job.body, history: [], state: initialState() },
      job.contact_token, 'whatsapp');
    expect(turn.result?.reply).toMatch(/Soy Tesi/);
    await db.query("UPDATE whatsapp_event SET lease_until=now()-interval '1 second' WHERE id=$1", [job.id]);
    await worker.run();
    expect(send).toHaveBeenCalledExactlyOnceWith(sender, turn.result.reply, job.turn_id);
    expect(await db.query('SELECT id_turno FROM turno_tesi WHERE id_turno=$1', [job.turn_id])).toHaveLength(1);
    expect(await db.query(`SELECT m.id_mensaje FROM mensaje m JOIN turno_tesi t USING(id_conversacion)
      WHERE t.id_turno=$1`, [job.turn_id])).toHaveLength(2);
  });

  it('retries confirmed throttling with backoff, then reconciles an ambiguous send without repeating it', async () => {
    send.mockResolvedValueOnce({ kind: 'retry' }).mockResolvedValueOnce({ kind: 'ambiguous' });
    await webhook([change([message('ambiguous')])]).expect(200);
    await worker.run();
    expect((await db.query('SELECT state,next_attempt_at>now() AS delayed FROM whatsapp_event'))[0])
      .toMatchObject({ state: 'pending', delayed: true });
    expect(await worker.run()).toEqual({ processed: false });
    await db.query('UPDATE whatsapp_event SET next_attempt_at=now()');
    await worker.run();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    const correlation = send.mock.calls[1][2];
    await worker.run();
    await webhook([change([], phone, [
      { id: 'out-correlation', status: 'delivered', biz_opaque_callback_data: correlation },
      { id: 'out-correlation', status: 'sent' },
    ])]).expect(200);
    expect((await db.query('SELECT state,delivery FROM whatsapp_outbound'))[0])
      .toEqual({ state: 'accepted', delivery: 'delivered' });
    expect(await db.query('SELECT id FROM whatsapp_event')).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('caps recoverable attempts and releases the next message in the same conversation', async () => {
    send.mockResolvedValue({ kind: 'retry' });
    await webhook([change([message('capped'),message('next')])]).expect(200);
    for (let n = 0; n < 5; n++) {
      await worker.run();
      await db.query("UPDATE whatsapp_event SET next_attempt_at=now() WHERE wamid='capped'");
    }
    const states = await db.query('SELECT state,attempts FROM whatsapp_event ORDER BY id');
    expect(states).toEqual([{ state: 'failed', attempts: 5 }, { state: 'pending', attempts: 0 }]);
    expect(new Set(send.mock.calls.map(call => call[2])).size).toBe(1);
    send.mockResolvedValueOnce({ kind: 'accepted', id: 'next-out' });
    await worker.run();
    expect((await db.query("SELECT state FROM whatsapp_event WHERE wamid='next'"))[0].state).toBe('done');
  });

  it('does not resend after a worker dies across the remote-send boundary', async () => {
    await webhook([change([message('crash')])]).expect(200);
    const job = await events.claim(phone);
    if (!job || job === 'recovered') throw new Error('Missing job');
    await events.prepare(job, 'Respuesta preparada', false);
    expect(await events.startSend(job, false)).toBe(true);
    await db.query("UPDATE whatsapp_event SET lease_until=now()-interval '1 second'");
    expect(await worker.run()).toEqual({ processed: true });
    expect((await db.query('SELECT state FROM whatsapp_outbound'))[0].state).toBe('ambiguous');
    expect(send).not.toHaveBeenCalled();
  });

  it('checks expiry at send, redacts recognized private questions, and handles unsupported data explicitly', async () => {
    await webhook([change([message('expired','Hola',secondSender,86_401)])]).expect(200);
    await worker.run();
    expect(send).not.toHaveBeenCalled();
    await webhook([change([message('private','Dime el saldo de mi contrato REF-PRIVADA'),
      message('long','a'.repeat(801)), { ...message('file'), type: 'document' }])]).expect(200);
    for (let n = 0; n < 3; n++) await worker.run();
    expect(send.mock.calls.map(call => call[1])).toEqual([
      expect.stringMatching(/verificación de identidad/),
      expect.stringMatching(/800 caracteres/),
      expect.stringMatching(/consultas en texto/),
    ]);
    expect(await db.query("SELECT id_mensaje FROM mensaje WHERE contenido LIKE '%REF-PRIVADA%'")).toHaveLength(0);
    expect(aiFetch).not.toHaveBeenCalled();
    await webhook([change([message('aged-before-send')])]).expect(200);
    const job = await events.claim(phone);
    if (!job || job === 'recovered') throw new Error('Missing job');
    await events.prepare(job, 'Ventana cerrada', false);
    await db.query("UPDATE whatsapp_session SET last_inbound_at=now()-interval '24 hours' WHERE id=$1", [job.session_id]);
    expect(await events.startSend(job, false)).toBe(false);
  });

  it('acknowledges a human handoff once and suspends automatic replies', async () => {
    await webhook([change([message('handoff','Quiero hablar con un asesor'),message('after')])]).expect(200);
    await worker.run();
    await worker.run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toBe('Un asesor revisará tu solicitud.');
    const [row] = await db.query(`SELECT c.estado,a.estado AS request_state FROM whatsapp_event e
      JOIN turno_tesi t ON t.id_turno=e.turn_id JOIN conversacion c USING(id_conversacion)
      JOIN agente_solicitud a USING(id_conversacion) WHERE e.wamid='handoff'`);
    expect(row).toMatchObject({ estado: 'derivada', request_state: 'pendiente' });
    expect((await db.query("SELECT state FROM whatsapp_event WHERE wamid='after'"))[0].state).toBe('skipped');
    expect(app.get(AttentionService)).toBeDefined();
  });

  it('cost: answers greetings, catalog, public resources and known packages with zero provider calls', async () => {
    vi.stubEnv('WHATSAPP_AI_MODE', 'live');
    const packages = vi.spyOn(app.get(PackagesService), 'authorized').mockResolvedValue([{
      idServicio: 9, codigo: 'PILOTO', nombre: 'Plan Brisa', descripcion: 'Orientaci\u00f3n sobre el servicio publicado.',
      publicoObjetivo: null, componentes: [], entregables: [], restricciones: [],
      precioFijo: '100.00', moneda: 'PEN', modalidad: 'virtual', duracionDias: null,
      vigenciaDesde: null, vigenciaHasta: null, version: 1,
    }] as Awaited<ReturnType<PackagesService['authorized']>>);
    try {
      await webhook([change([message('hello-cost'), message('catalog-cost', '\u00bfQu\u00e9 servicios ofrecen?'),
        message('resources-cost', 'Recursos gratuitos'), message('named-cost', 'Quiero saber del Plan Brisa')])]).expect(200);
      for (let count = 0; count < 4; count++) await worker.run();
      expect(send.mock.calls.map(call => call[1])).toEqual([
        expect.stringContaining('Plan Brisa'), expect.stringContaining('Plan Brisa'),
        expect.stringMatching(/recursos publicados/i), expect.stringContaining('servicio publicado'),
      ]);
      expect(aiFetch).not.toHaveBeenCalled();
      expect(await db.query('SELECT calls FROM whatsapp_ai_budget')).toEqual([]);
    } finally {
      packages.mockRestore();
    }
  });

  it('cost: uses local clarification when disabled and deterministic simulation without network', async () => {
    await webhook([change([message('off-cost', 'Necesito orientaci\u00f3n para empezar'),
      message('sim-cost', 'Me interesa una asesor\u00eda inicial')])]).expect(200);
    await worker.run();
    vi.stubEnv('WHATSAPP_AI_MODE', 'simulate');
    await worker.run();
    expect(send.mock.calls[0][1]).toContain('preguntas generales');
    expect(send.mock.calls[1][1]).toContain('Soy Tesi');
    expect(aiFetch).not.toHaveBeenCalled();
    expect(await db.query('SELECT calls FROM whatsapp_ai_budget')).toEqual([]);
  });

  it('cost: reserves at most one daily attempt across concurrent sessions', async () => {
    vi.stubEnv('WHATSAPP_AI_MODE', 'live');
    vi.stubEnv('WHATSAPP_AI_DAILY_LIMIT', '1');
    vi.stubEnv('WHATSAPP_AI_OUTPUT_TOKENS', '96');
    await webhook([change([message('concurrent-a', 'Necesito orientaci\u00f3n para empezar'),
      message('concurrent-b', 'Me interesa asesor\u00eda inicial', secondSender)])]).expect(200);
    await Promise.all([worker.run(), worker.run()]);
    expect(aiFetch).toHaveBeenCalledTimes(1);
    const [, options] = aiFetch.mock.calls[0];
    const requestBody = JSON.parse(String(options.body));
    expect(requestBody.max_output_tokens).toBe(96);
    expect(requestBody.text.format.name).toBe('agent_marketing');
    expect(JSON.parse(requestBody.input)).not.toHaveProperty('history');
    expect(await db.query('SELECT calls FROM whatsapp_ai_budget')).toEqual([{ calls: 1 }]);
    expect(send.mock.calls.map(call => call[1])).toEqual(expect.arrayContaining([
      expect.stringContaining('Soy Tesi'), expect.stringContaining('preguntas generales'),
    ]));
  });

  it('cost: falls back locally after a provider error without using the alternate provider', async () => {
    vi.stubEnv('WHATSAPP_AI_MODE', 'live');
    const options = app.get(AiService).options;
    const alternate = vi.fn<typeof fetch>().mockRejectedValue(new Error('Unexpected alternate'));
    const spy = vi.spyOn(app.get(AiService), 'options').mockImplementation((...args) => ({
      ...options(...args), fallbacks: [{ provider: 'gemini', apiKey: 'synthetic', fetchImpl: alternate }],
    }));
    try {
      aiFetch.mockResolvedValueOnce(Response.json({ error: {} }, { status: 429 }));
      await webhook([change([message('failure-cost', 'Necesito orientaci\u00f3n para empezar')])]).expect(200);
      await worker.run();
      expect(aiFetch).toHaveBeenCalledTimes(1);
      expect(alternate).not.toHaveBeenCalled();
      expect(send.mock.calls[0][1]).toContain('preguntas generales');
      expect(await db.query('SELECT state,attempts FROM whatsapp_event')).toEqual([{ state: 'done', attempts: 1 }]);
    } finally {
      spy.mockRestore();
    }
  });

  it('cost: keeps private, out-of-scope and expired messages away from billable classification', async () => {
    vi.stubEnv('WHATSAPP_AI_MODE', 'live');
    await webhook([change([message('private-cost', 'Necesito orientaci\u00f3n sobre mi contrato'),
      message('outside-cost', 'Resume el partido de ayer'),
      message('expired-cost', 'Necesito orientaci\u00f3n para empezar', secondSender, 86_401)])]).expect(200);
    for (let count = 0; count < 3; count++) await worker.run();
    expect(aiFetch).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1]).toContain('verificaci\u00f3n de identidad');
    expect(await db.query('SELECT calls FROM whatsapp_ai_budget')).toEqual([]);
  });

});
