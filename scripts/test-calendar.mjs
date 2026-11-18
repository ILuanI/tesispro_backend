// Integration suite: disposable PostgreSQL schema and a fake Google provider. Never creates real events.
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import source from '../dist/database/typeorm.config.js';
import { AdminModule } from '../dist/modules/admin/admin.module.js';
import { CalendarService, bookingSlots, calendarDay, overlaps } from '../dist/modules/admin/calendar.service.js';
import { GoogleCalendarService, encryptCalendarToken, decryptCalendarToken } from '../dist/modules/admin/google-calendar.service.js';
import { passwordHash } from '../dist/modules/admin/auth.js';
import { JourneysService } from '../dist/modules/admin/journeys.service.js';
import { calendarScopes } from '../dist/modules/admin/google-calendar.service.js';

const schema = 'calendar_test_' + randomBytes(8).toString('hex');
const control = new DataSource({ ...source.options, migrations: [] });
let db, app;
const remote = new Map(), notifications = [];
let loseInsertResponse = false, loseMoveResponse = false, loseDeleteResponse = false, meetSupported = true, unavailable = false;
const externalBusy = [];
const fake = {
  status: async () => ({ configured: true, connected: true, calendarId: 'test-calendar' }),
  async client() {
    if (unavailable) throw new Error('offline');
    return { calendarId: 'test-calendar', api: {
      calendars: { get: async () => ({ data: { conferenceProperties: { allowedConferenceSolutionTypes: meetSupported ? ['hangoutsMeet'] : [] } } }) },
      events: {
        async insert({ requestBody, sendUpdates }) {
          assert.equal(sendUpdates, 'all');
          if (remote.has(requestBody.id)) throw Object.assign(new Error('duplicate'), { code: 409 });
          const event = { ...structuredClone(requestBody), status: 'confirmed', htmlLink: 'https://calendar.google.com/test',
            ...(meetSupported ? { hangoutLink: 'https://meet.google.com/abc-defg-hij' } : {}) };
          remote.set(event.id, event); notifications.push('insert');
          if (loseInsertResponse) { loseInsertResponse = false; throw new Error('lost response'); }
          return { data: event };
        },
        async patch({ eventId, requestBody, sendUpdates }) {
          assert.equal(sendUpdates, 'all');
          const event = { ...remote.get(eventId), ...requestBody };
          remote.set(eventId, event); notifications.push('patch');
          if (loseMoveResponse) { loseMoveResponse = false; throw new Error('lost move response'); }
          return { data: event };
        },
        async delete({ eventId, sendUpdates }) {
          assert.equal(sendUpdates, 'all'); remote.delete(eventId); notifications.push('delete');
          if (loseDeleteResponse) { loseDeleteResponse = false; throw new Error('lost delete response'); }
        },
        async list({ timeMin, timeMax }) { return { data: { items: [...remote.values()].filter(e => e.status !== 'cancelled' && overlaps(Date.parse(timeMin), Date.parse(timeMax), Date.parse(e.start.dateTime), Date.parse(e.end.dateTime))) } }; },
      },
    } };
  },
  async busy(start, end) {
    if (unavailable) throw new Error('offline');
    return [...externalBusy, ...[...remote.values()].filter(e => e.status !== 'cancelled').map(e => ({ start: e.start.dateTime, end: e.end.dateTime }))]
      .filter(b => overlaps(Date.parse(start), Date.parse(end), Date.parse(b.start), Date.parse(b.end)));
  },
  async event(id) { if (unavailable) throw new Error('offline'); return structuredClone(remote.get(id) || null); },
};
try {
  const key = randomBytes(32).toString('base64');
  const encrypted = encryptCalendarToken('secret-test-token', key);
  assert.equal(decryptCalendarToken(encrypted, key), 'secret-test-token');
  assert.ok(!encrypted.includes('secret-test-token'));
  assert.throws(() => decryptCalendarToken(encrypted, randomBytes(32).toString('base64')));
  await control.initialize();
  await control.query(`CREATE SCHEMA ${schema}`);
  const options = { ...source.options, schema, extra: { ...source.options.extra, options: `-c search_path=${schema}`, max: 8 } };
  db = new DataSource(options); await db.initialize(); await db.runMigrations();
  await db.query("INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('Calendar','Test','calendar@example.test','administrador',$1)", [await passwordHash('calendar-test-password')]);
  const module = await Test.createTestingModule({ imports: [TypeOrmModule.forRoot({ ...options, migrationsRun: false }), AdminModule] })
    .overrideProvider(GoogleCalendarService).useValue(fake).compile();
  app = module.createNestApplication({ logger: false }); await app.listen(0, '127.0.0.1');
  process.env.APP_ORIGIN = 'http://localhost:4321';
  const base = await app.getUrl();
  let cookie = '';
  async function call(path, method = 'GET', body, expected = 200, customCookie = undefined, origin = process.env.APP_ORIGIN) {
    const res = await fetch(base + path, { method, headers: { Origin: origin, Cookie: customCookie ?? cookie,
      ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json();
    assert.equal(res.status, expected, `${path}: ${JSON.stringify(data)}`);
    return { data, cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  await call('/admin/calendario/eventos?desde=2026-01-01T00:00:00Z&hasta=2026-02-01T00:00:00Z', 'GET', undefined, 401);
  cookie = (await call('/auth/login', 'POST', { correo: 'calendar@example.test', password: 'calendar-test-password' })).cookie;
  await call('/admin/calendario/actualizar', 'POST', undefined, 403, undefined, 'https://untrusted.test');
  const cal = app.get(CalendarService);
  const candidateSlots = Array.from({ length: 29 }, (_, i) => calendarDay(Date.now() + (i + 1) * 86400000)).flatMap(d => bookingSlots(d));
  const slots = candidateSlots.slice(0, 20);
  assert.ok(slots.length >= 20);
  externalBusy.push({ start: new Date(Date.parse(slots[0]) + 5 * 60000).toISOString(), end: new Date(Date.parse(slots[0]) + 10 * 60000).toISOString() });
  assert.ok(!(await cal.availability(calendarDay(Date.parse(slots[0])))).horarios.includes(slots[0]));
  const dto = (slot, n = 0) => ({ clave: randomUUID(), fuente: 'consulta', canal: 'directo', consentimiento: true,
    nombres: `Calendar Person ${n}`, correo: `calendar-person-${n}@example.test`, telefono: `+5199999${String(n).padStart(4, '0')}`, fechaInicio: slot });
  const first = dto(slots[1], 1);
  const visitor = (await call('/captacion/sesion', 'POST', undefined, 201, '')).cookie;
  const booked = (await call('/captacion/reuniones', 'POST', first, 201, visitor)).data;
  assert.equal(booked.estado, 'confirmada'); assert.ok(booked.meetUrl);
  const blocked = dto(slots[0], 9);
  await call('/admin/calendario/reuniones', 'POST', blocked, 409);
  const [rejected] = await db.query('SELECT * FROM reunion WHERE clave_idempotencia=$1', [blocked.clave]);
  assert.equal(rejected.estado, 'cancelada'); assert.equal(rejected.pending_action, null);
  const [firstLocal] = await db.query('SELECT id_lead FROM reunion WHERE id_reunion=$1', [booked.idReunion]);
  const legacyId = randomUUID();
  await db.query(`INSERT INTO reunion(id_reunion,id_lead,fecha_inicio,fecha_fin,nombres,telefono,correo,estado) VALUES($1,$2,$3,$3::timestamptz+interval '30 minutes','Legacy','+51999888777','legacy@example.test','confirmada')`, [legacyId, firstLocal.id_lead, slots[0]]);
  await cal.prepare(legacyId, 'link');
  await assert.rejects(cal.execute(legacyId));
  const [legacy] = await db.query('SELECT * FROM reunion WHERE id_reunion=$1', [legacyId]);
  assert.equal(legacy.estado, 'confirmada'); assert.equal(legacy.external_event_id, null); assert.equal(legacy.sync_status, 'sin_vincular');
  await cal.cancel(legacyId, 'Legacy test cancellation', 1);
  const replay = (await call('/captacion/reuniones', 'POST', first, 201, visitor)).data;
  assert.equal(replay.idReunion, booked.idReunion); assert.equal(notifications.filter(n => n === 'insert').length, 1);
  await call('/captacion/reuniones', 'POST', { ...first, nombres: 'Changed' }, 409, visitor);
  await call('/admin/calendario/reuniones', 'POST', dto(slots[1], 2), 409);
  // Two real HTTP bookings for the same slot; exactly one may create a Google event.
  const requestA = dto(slots[2], 3), requestB = dto(slots[2], 4);
  const responses = await Promise.all([requestA, requestB].map(body => fetch(base + '/admin/calendario/reuniones', {
    method: 'POST', headers: { Origin: process.env.APP_ORIGIN, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })));
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  loseInsertResponse = true;
  const uncertain = dto(slots[3], 5);
  await call('/admin/calendario/reuniones', 'POST', uncertain, 503);
  const [pending] = await db.query('SELECT * FROM reunion WHERE clave_idempotencia=$1', [uncertain.clave]);
  assert.equal(pending.estado, 'pendiente'); assert.equal(pending.sync_status, 'error');
  assert.ok(!(await cal.availability(calendarDay(Date.parse(slots[3])))).horarios.includes(slots[3]));
  const insertsBefore = notifications.filter(n => n === 'insert').length;
  const recovered = (await call('/admin/calendario/reuniones', 'POST', uncertain, 201)).data;
  assert.equal(recovered.estado, 'confirmada'); assert.equal(notifications.filter(n => n === 'insert').length, insertsBefore);
  loseMoveResponse = true;
  await call(`/admin/calendario/reuniones/${recovered.idReunion}/reprogramar`, 'POST', { fechaInicio: slots[4] }, 503);
  assert.equal((await db.query('SELECT count(*)::int n FROM calendar_hold WHERE id_reunion=$1', [recovered.idReunion]))[0].n, 1);
  const moved = (await call(`/admin/calendario/reuniones/${recovered.idReunion}/reprogramar`, 'POST', { fechaInicio: slots[4] }, 201)).data;
  assert.equal(new Date(moved.fechaInicio).toISOString(), slots[4]);
  assert.equal((await db.query('SELECT count(*)::int n FROM calendar_hold'))[0].n, 0);
  const [linked] = await db.query('SELECT * FROM reunion WHERE id_reunion=$1', [recovered.idReunion]);
  const remoteEvent = remote.get(linked.external_event_id);
  // Google may change duration and move a meeting outside Tesispro's booking hours.
  remoteEvent.start.dateTime = calendarDay(Date.parse(slots[5])) + 'T20:15:00-05:00';
  remoteEvent.end.dateTime = calendarDay(Date.parse(slots[5])) + 'T21:00:00-05:00';
  await cal.refresh();
  assert.equal(new Date((await db.query('SELECT fecha_inicio FROM reunion WHERE id_reunion=$1', [recovered.idReunion]))[0].fecha_inicio).toISOString(), new Date(remoteEvent.start.dateTime).toISOString());
  remoteEvent.status = 'cancelled'; await cal.refresh();
  assert.equal((await db.query('SELECT estado FROM reunion WHERE id_reunion=$1', [recovered.idReunion]))[0].estado, 'cancelada');
  meetSupported = false;
  const noMeet = (await call('/admin/calendario/reuniones', 'POST', dto(slots[6], 6), 201)).data;
  assert.equal(noMeet.meetUrl, null); assert.equal(noMeet.estado, 'confirmada');
  await call(`/admin/calendario/reuniones/${noMeet.idReunion}/meet`, 'POST', { meetUrl: 'https://meet.google.com/xyz-abcd-efg' }, 201);
  await cal.refresh();
  assert.equal((await db.query('SELECT meet_url FROM reunion WHERE id_reunion=$1', [noMeet.idReunion]))[0].meet_url, 'https://meet.google.com/xyz-abcd-efg');
  loseDeleteResponse = true;
  await call(`/admin/reuniones/${noMeet.idReunion}/cancelar`, 'POST', { motivo: 'Test cancellation' }, 503);
  await call(`/admin/reuniones/${noMeet.idReunion}/cancelar`, 'POST', { motivo: 'Test cancellation' }, 201);
  assert.equal((await db.query('SELECT estado FROM reunion WHERE id_reunion=$1', [noMeet.idReunion]))[0].estado, 'cancelada');
  unavailable = true;
  await call(`/captacion/reuniones/disponibilidad?fecha=${calendarDay(Date.parse(slots[7]))}`, 'GET', undefined, 503);
  unavailable = false;
  await call('/admin/calendario/eventos?desde=2026-01-01T00:00:00Z&hasta=2027-01-01T00:00:00Z', 'GET', undefined, 400);
  await call(`/admin/calendario/reuniones/${booked.idReunion}/reprogramar`, 'POST', { fechaInicio: calendarDay() + 'T23:15:00-05:00' }, 400);
  const realGoogle = new GoogleCalendarService(db);
  await assert.rejects(realGoogle.callback('invalid', 'code'));
  let oauthState;
  realGoogle.key = () => key;
  realGoogle.oauth = () => ({
    generateCodeVerifierAsync: async () => ({ codeVerifier: 'test-verifier', codeChallenge: 'test-challenge' }),
    generateAuthUrl(options) { oauthState = options.state; assert.equal(options.access_type, 'offline'); return 'https://accounts.google.com/test'; },
    async getToken({ codeVerifier }) { assert.equal(codeVerifier, 'test-verifier'); return { tokens: { refresh_token: 'fake-offline-refresh', scope: calendarScopes.join(' ') } }; },
  });
  const [admin] = await db.query("SELECT id_usuario FROM usuario_interno WHERE correo='calendar@example.test'");
  await realGoogle.authorize(admin.id_usuario);
  await realGoogle.callback(oauthState, 'test-code');
  const [connection] = await db.query('SELECT * FROM google_calendar_connection');
  assert.equal(decryptCalendarToken(connection.refresh_token, key), 'fake-offline-refresh');
  await assert.rejects(realGoogle.callback(oauthState, 'test-code'));
  await realGoogle.authorize(admin.id_usuario);
  await assert.rejects(realGoogle.callback(oauthState, '', 'access_denied'));
  // Resource reservation follows the same Google workflow and preserves its business events.
  const resourceForm = new FormData();
  for (const [name, value] of Object.entries({ titulo: 'Calendar test resource', categoria: 'metodologia_investigacion', formato: 'pdf', activo: 'true', publicado: 'true', destacado: 'true' })) resourceForm.set(name, value);
  resourceForm.set('archivo', new Blob(['%PDF-1.4\nCalendar test']), 'calendar.pdf');
  const resourceResponse = await fetch(base + '/admin/recursos', { method: 'POST', headers: { Cookie: cookie, Origin: process.env.APP_ORIGIN }, body: resourceForm });
  const resource = await resourceResponse.json(); assert.equal(resourceResponse.status, 201, JSON.stringify(resource));
  const journeys = app.get(JourneysService);
  const access = await journeys.visit(resource.idRecurso, { canal: 'directo' });
  await journeys.contact(access.token, { nombres: 'Resource Person', telefono: '+51999888777', consentimiento: true });
  await journeys.options(access.token); await journeys.startMeeting(access.token);
  const resourceDto = { nombres: 'Resource Person', correo: 'resource-calendar@example.test', telefono: '+51999888777', fechaInicio: slots[8] };
  const resourceBooking = await journeys.book(access.token, resourceDto);
  assert.equal(resourceBooking.estado, 'confirmada');
  assert.equal((await journeys.book(access.token, resourceDto)).idReunion, resourceBooking.idReunion);
  await assert.rejects(journeys.book(access.token, { ...resourceDto, correo: 'changed@example.test' }));
  const [request] = await db.query('SELECT id_solicitud FROM reunion WHERE id_reunion=$1', [resourceBooking.idReunion]);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM evento_recurso WHERE id_solicitud=$1 AND tipo='reserva_confirmada'", [request.id_solicitud]))[0].n, 1);
  await cal.cancel(resourceBooking.idReunion, 'Resource test cancellation', admin.id_usuario);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM evento_recurso WHERE id_solicitud=$1 AND tipo='reserva_cancelada'", [request.id_solicitud]))[0].n, 1);
  console.log('Calendar integration OK: migrations, auth/origin, availability/overlap, idempotency, concurrency, lost responses, reschedule, external changes, cancellation, Meet fallback, encrypted tokens.');
} finally {
  if (app) await app.close();
  if (db?.isInitialized) await db.destroy();
  if (control.isInitialized) { await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await control.destroy(); }
}
