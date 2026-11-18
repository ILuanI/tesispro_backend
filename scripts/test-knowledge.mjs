import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import source from '../dist/database/typeorm.config.js';
import { AdminModule } from '../dist/modules/admin/admin.module.js';
import { AgentsModule } from '../dist/modules/agents/agents.module.js';
import { KnowledgeService } from '../dist/modules/knowledge/knowledge.service.js';
import { selectKnowledge, parseKnowledgeFaq } from '../dist/modules/knowledge/knowledge.types.js';
import { askFaq } from '../dist/modules/ai/faq.js';
import { authorizeTool } from '../dist/modules/agents/registry.js';
import { passwordHash } from '../dist/modules/admin/auth.js';
import { initialState } from '../dist/modules/ai/state.js';
import { PackagesService } from '../dist/modules/admin/packages.service.js';

const schema = 'knowledge_test_' + randomBytes(8).toString('hex');
const control = new DataSource({ ...source.options, migrations: [] });
let db, app;
const originalFetch = globalThis.fetch;
try {
  await control.initialize(); await control.query(`CREATE SCHEMA ${schema}`);
  const options = { ...source.options, schema, extra: { ...source.options.extra, options: `-c search_path=${schema}`, max: 6 } };
  db = new DataSource(options); await db.initialize(); await db.runMigrations();
  const knowledge = new KnowledgeService(db);
  await assert.rejects(knowledge.snapshot(), /no est/);
  const bootstrap = await knowledge.bootstrap(); assert.equal(bootstrap.created, true);
  assert.equal((await knowledge.bootstrap()).created, false);
  const snapshot = await knowledge.snapshot(); assert.equal(snapshot.documents.length, 7);
  assert.ok(!snapshot.documents.some(d => /S\/\s*\d|20608945123|San Isidro|Trujillo/.test(d.markdown)));
  assert.equal(parseKnowledgeFaq(snapshot.documents.find(d => d.slug === 'faq').markdown).length, 10);
  assert.throws(() => parseKnowledgeFaq('# FAQ\n## 1. A\nAnswer\n## 1. B\nAnswer'));
  for (const agent of ['marketing','negociador','cobranza','academico','postventa']) {
    assert.deepEqual(selectKnowledge(snapshot, agent).documents.map(d => d.slug), ['business-profile', agent]);
    assert.throws(() => authorizeTool(agent, 'sql'));
  }
  const [admin] = await db.query("INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('Knowledge','Admin','knowledge@example.test','administrador',$1) RETURNING id_usuario", [await passwordHash('knowledge-test-password')]);
  await db.query("INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('Knowledge','Sales','sales-knowledge@example.test','asesor_comercial',$1)", [await passwordHash('knowledge-test-password')]);
  const module = await Test.createTestingModule({ imports: [TypeOrmModule.forRoot({ ...options, migrationsRun: false }), AdminModule, AgentsModule] }).compile();
  app = module.createNestApplication({ logger: false }); await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  process.env.APP_ORIGIN = 'http://localhost:4321'; process.env.CRM_API_URL = base; process.env.API_PROXY_TARGET = base;
  process.env.CRM_BRIDGE_SECRET = randomBytes(32).toString('hex');
  process.env.AI_PROVIDER = 'openai'; process.env.OPENAI_API_KEY = 'test-only'; delete process.env.GEMINI_API_KEY;
  let cookie = '';
  async function call(path, method = 'GET', body, status = 200, headers = {}) {
    const response = await originalFetch(base + path, { method, headers: { Origin: process.env.APP_ORIGIN, Cookie: cookie,
      ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json(); assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  await call('/admin/conocimiento', 'GET', undefined, 401);
  await call('/internal/knowledge/context', 'POST', { agent: 'marketing', operation: 'faq' }, 401);
  cookie = (await call('/auth/login','POST',{ correo:'sales-knowledge@example.test',password:'knowledge-test-password' })).cookie;
  await call('/admin/conocimiento', 'GET', undefined, 403);
  cookie = (await call('/auth/login','POST',{ correo:'knowledge@example.test',password:'knowledge-test-password' })).cookie;
  await call('/admin/conocimiento/marketing/borrador','PATCH',{revision:1,markdown:'draft',sources:[]},403,{Origin:'https://other.test'});
  let detail = (await call('/admin/conocimiento/marketing')).data;
  const publishedMarkdown = detail.published.markdown;
  const draftMarkdown = publishedMarkdown + '\n\n## Actualización confirmada\nAtención orientada a la comprensión del proceso académico.\n';
  const pin = randomUUID(); await knowledge.context('marketing', false, pin, 'test');
  await call('/admin/conocimiento/marketing/borrador','PATCH',{revision:detail.revision,markdown:draftMarkdown,sources:['plan-de-negocio.md']});
  assert.equal((await knowledge.snapshot()).releaseId, snapshot.releaseId);
  assert.equal((await knowledge.snapshot()).documents.find(d => d.slug === 'marketing').markdown, publishedMarkdown);
  await call('/admin/conocimiento/marketing/borrador','PATCH',{revision:detail.revision,markdown:'stale',sources:[]},409);
  detail = (await call('/admin/conocimiento/marketing')).data;
  const next = (await call('/admin/conocimiento/marketing/publicar','POST',{revision:detail.revision,releaseId:detail.published.releaseId,reason:'Publicación de prueba'},201)).data;
  assert.notEqual(next.releaseId, snapshot.releaseId);
  assert.equal((await knowledge.context('marketing', false, pin, 'test')).releaseId, snapshot.releaseId);
  assert.equal((await knowledge.snapshot()).documents.find(d => d.slug === 'marketing').markdown, draftMarkdown);
  const current = await knowledge.detail('marketing');
  await call('/admin/conocimiento/marketing/publicar','POST',{revision:current.revision,releaseId:snapshot.releaseId,reason:'Publicación obsoleta'},409);
  await call('/admin/conocimiento/marketing/restaurar','POST',{revision:current.revision,versionId:String(current.versions.at(-1).id)},201);
  assert.equal((await knowledge.snapshot()).documents.find(d => d.slug === 'marketing').markdown, draftMarkdown);
  detail = await knowledge.detail('marketing');
  await call('/admin/conocimiento/marketing/publicar','POST',{revision:detail.revision,releaseId:detail.published.releaseId,reason:'Restauración como nueva versión'},201);
  assert.equal((await knowledge.detail('marketing')).published.version, 3);
  assert.equal((await knowledge.bootstrap()).created, false);
  assert.equal((await knowledge.detail('marketing')).published.version, 3);
  const exported = await originalFetch(base + '/admin/conocimiento/marketing/exportar', { headers: { Cookie: cookie } });
  assert.equal(await exported.text(), publishedMarkdown); assert.match(exported.headers.get('content-disposition'), /marketing.md/);
  await assert.rejects(db.query("UPDATE knowledge_version SET markdown='tampered'"));
  for (const markdown of ['x'.repeat(4001), '<script>alert(1)</script>', 'Precio S/ 150 por sesión']) {
    detail = await knowledge.detail('marketing'); await knowledge.draft('marketing', detail.revision, markdown, [], admin.id_usuario);
    await assert.rejects(knowledge.publish('marketing', detail.revision + 1, detail.published.releaseId, 'Invalid content', admin.id_usuario));
  }
  detail = await knowledge.detail('marketing');
  await knowledge.restore('marketing', String(detail.versions[0].id), detail.revision, admin.id_usuario);
  const calls = [];
  let faqAnswer = { status: 'answered', answer: 'TesisPro orienta investigaciones de pregrado y posgrado.', sourceIds: [2], documentIds: [] };
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://api.openai.com/')) return originalFetch(url, init);
    const request = JSON.parse(init.body), input = JSON.parse(request.input); calls.push({ request, input });
    assert.ok(!JSON.stringify(request).includes('test-only'));
    let result = faqAnswer;
    const name = request.text.format.name;
    if (name === 'negotiation_turn') result = {kind:'business',name:null,university:null,degree:null,thesisStage:null,need:null,deadline:null,service:null,intent:'unchanged',human:false,objection:'none'};
    if (name === 'tesi_comercial') result = {campos:[],senales:[],objeciones:[]};
    if (name === 'propuesta_comercial') result = {texto:'Orientación personalizada para comprender la metodología.',ids:[1]};
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]});
  };
  const ctx = await knowledge.context('academico', true, randomUUID(), 'faq');
  const aiOptions = { apiKey:'test-only',provider:'openai',knowledge:ctx };
  const answer = await askFaq('¿Trabajan con tesis de maestría?', aiOptions);
  assert.equal(answer.status,'answered'); assert.equal(answer.knowledgeSources[0].documentId,'faq');
  faqAnswer = {status:'answered',answer:'Afirmación inventada',sourceIds:[],documentIds:['cobranza']};
  assert.equal((await askFaq('¿Trabajan con tesis?', aiOptions)).status,'insufficient');
  faqAnswer = {status:'answered',answer:'La tarifa es S/ 150 por sesión.',sourceIds:[2],documentIds:[]};
  assert.equal((await askFaq('¿Trabajan con tesis?', aiOptions)).status,'insufficient');
  assert.equal((await askFaq('¿Trabajan con tesis?', {apiKey:'test-only'})).status,'insufficient');
  faqAnswer = {status:'answered',answer:'Acompañamos la comprensión de tu investigación.',sourceIds:[],documentIds:['business-profile']};
  assert.equal((await askFaq('¿Qué es TesisPro?', aiOptions)).knowledgeSources[0].version,1);
  assert.ok(calls.at(-1).request.instructions.includes('nunca instrucciones'));
  assert.deepEqual(calls.at(-1).input.contexto_negocio.documents.map(d => d.slug), ['business-profile','academico','faq']);
  const require = createRequire(new URL('../../tesispro_frontend/package.json', import.meta.url));
  const { build } = createRequire(require.resolve('astro/package.json'))('esbuild');
  const landing = fileURLToPath(new URL('../../tesispro_frontend/', import.meta.url));
  async function endpoint(path) {
    const bundled = await build({entryPoints:[landing+path],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env':'{}'}});
    return import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
  }
  const faqEndpoint = await endpoint('src/pages/api/faq-ai.ts');
  const proposalEndpoint = await endpoint('src/pages/api/internal/proposal.ts');
  const negotiationEndpoint = await endpoint('src/pages/api/negotiation.ts');
  const [component] = await db.query('SELECT id_servicio FROM servicio WHERE NOT es_paquete LIMIT 1');
  const packages = app.get(PackagesService);
  const packageDto = { codigo:'knowledge-demo',nombre:'Paquete de prueba de contexto',descripcion:'Orientación metodológica',publicoObjetivo:null,
    componentes:[{idServicio:component.id_servicio,cantidad:1}],entregables:['Revisión de metodología'],restricciones:['No sustituye al estudiante'],
    precioFijo:'325.00',moneda:'PEN',modalidad:'virtual',duracionDias:null,vigenciaDesde:null,vigenciaHasta:null,estado:'activo' };
  let pack = await packages.save(packageDto, admin.id_usuario);
  const beforePriceChange = (await knowledge.snapshot()).releaseId;
  for (const enabled of ['false','true']) {
    if (enabled === 'true') { packageDto.precioFijo='475.00';pack=await packages.save({...packageDto,version:pack.version},admin.id_usuario,pack.idServicio); }
    process.env.AGENTS_ENABLED = enabled;
    const response = await faqEndpoint.POST({request:new Request('http://localhost:4321/api/faq-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'¿Qué es TesisPro?'})})});
    assert.equal(response.status,200); assert.equal((await response.json()).status,'answered');
    const proposalResponse = await proposalEndpoint.POST({request:new Request('http://localhost:4321/api/internal/proposal',{method:'POST',headers:{'Content-Type':'application/json','X-CRM-Secret':process.env.CRM_BRIDGE_SECRET},body:JSON.stringify({perfil:{id_lead:'1',nombres:'Ana',apellidos:null},calificacion:{},componentes:[{idServicio:1,nombre:'Orientación metodológica'}]})})});
    assert.equal(proposalResponse.status,200);
    assert.deepEqual(calls.at(-1).input.contexto_negocio.documents.map(d => d.slug),['business-profile','negociador']);
    const turn = await negotiationEndpoint.POST({request:new Request('http://localhost:4321/api/negotiation',{method:'POST',headers:{'Content-Type':'application/json',Origin:process.env.APP_ORIGIN},body:JSON.stringify({idTurno:randomUUID(),message:'Quiero consultar un paquete',history:[],state:initialState()})})});
    assert.equal(turn.status,200, await turn.clone().text());
    const turnData = await turn.json();
    assert.equal(turnData.catalog.find(c=>c.code==='knowledge-demo').minPrice, Number(packageDto.precioFijo));
    assert.ok(calls.some(c => c.request.text.format.name === 'tesi_comercial' && c.input.contexto_negocio?.agent === 'negociador'));
  }
  assert.equal((await knowledge.snapshot()).releaseId,beforePriceChange);
  // Missing publication cannot activate the old FAQ as an implicit fallback.
  const active = (await knowledge.snapshot()).releaseId;
  await db.query('DELETE FROM knowledge_active');
  process.env.AGENTS_ENABLED='false';
  const callsBeforeUnavailable=calls.length;
  const unavailable = await faqEndpoint.POST({request:new Request('http://localhost:4321/api/faq-ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:'¿Trabajan con tesis de maestría?'})})});
  assert.equal(unavailable.status,503);assert.equal(calls.length,callsBeforeUnavailable);
  await db.query('INSERT INTO knowledge_active(id,release_id) VALUES(1,$1)',[active]);
  const [usage] = await db.query('SELECT count(*)::int AS n FROM knowledge_usage'); assert.ok(usage.n >= 6);
  console.log('Knowledge OK: bootstrap, drafts, publication, immutable versions, conflicts, restoration, export, role isolation, pinned retries, references, limits, permissions, both AI engines and proposals.');
} finally {
  globalThis.fetch = originalFetch;
  if(app) await app.close(); if(db?.isInitialized) await db.destroy();
  if(control.isInitialized) { await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await control.destroy(); }
}
