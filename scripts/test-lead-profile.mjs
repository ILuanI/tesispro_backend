import { developmentUiProxy } from './development-ui-proxy.mjs';
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import source from '../dist/database/typeorm.config.js';
import { AdminModule } from '../dist/modules/admin/admin.module.js';
import { passwordHash } from '../dist/modules/admin/auth.js';
import { LeadProfiling1792500000000 } from '../dist/migrations/1792500000000-LeadProfiling.js';

const schema = 'r6_test_' + randomBytes(8).toString('hex');
const control = new DataSource({ ...source.options, migrations: [] });
let db, app, uiProxy, browser;
try {
  await control.initialize();
  await control.query(`CREATE SCHEMA ${schema}`);
  const options = {
    ...source.options,
    schema,
    extra: { options: `-c search_path=${schema}` },
    synchronize: false,
  };
  db = new DataSource(options);
  await db.initialize();
  await db.runMigrations();
  await db.query(
    "INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('Admin','R6','r6@example.test','administrador',$1)",
    [await passwordHash('profile-test-123')],
  );
  class Root {}
  Module({ imports: [TypeOrmModule.forRoot(options), AdminModule] })(Root);
  app = await NestFactory.create(Root, { logger: false });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  process.env.APP_ORIGIN = 'http://localhost:4321';
  process.env.CRM_BRIDGE_SECRET = randomBytes(32).toString('hex');
  let admin = '',
    visitor = '';
  async function call(path, method = 'GET', body, status = 200, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: {
        Origin: process.env.APP_ORIGIN,
        Cookie: path.startsWith('/admin') ? admin : visitor,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    assert.equal(res.status, status, `${path}: ${JSON.stringify(data)}`);
    const cookie = res.headers.get('set-cookie');
    if (cookie) {
      if (path === '/auth/login') admin = cookie.split(';')[0];
      else visitor = cookie.split(';')[0];
    }
    return data;
  }
  await call('/admin/leads', 'GET', undefined, 401);
  await call('/admin/propuestas-comerciales/catalogo', 'GET', undefined, 401);
  await call('/auth/login', 'POST', {
    correo: 'r6@example.test',
    password: 'profile-test-123',
  });
  let lead = await call(
    '/admin/leads',
    'POST',
    { correo: 'only@example.test' },
    201,
  );
  const id = lead.idLead;
  assert.equal(lead.nombres, null);
  assert.equal(lead.telefono, null);
  await call(`/admin/leads/${id}`, 'PATCH', {
    revision: lead.revision,
    nombres: 'Confirmado',
    perfilAcademico: { universidadOtra: 'Universidad confirmada' },
    perfilLaboral: { ocupacion: 'Docente', horasLibresSemana: 5 },
    proyectos: [{ tema: 'Tema A' }, { tema: 'Tema B' }],
  });
  lead = await call(`/admin/leads/${id}`);
  assert.equal(lead.perfilLaboral.ocupacion, 'Docente');
  assert.equal(lead.proyectos.length, 2);
  await call(
    `/admin/leads/${id}`,
    'PATCH',
    { revision: 1, nombres: 'Obsoleto' },
    409,
  );
  await call(`/admin/leads/${id}`, 'PATCH', {
    revision: lead.revision,
    perfilLaboral: { horasLibresSemana: 0 },
  });
  lead = await call(`/admin/leads/${id}`);
  assert.equal(lead.perfilLaboral.ocupacion, 'Docente');
  assert.equal(lead.perfilLaboral.horasLibresSemana, 0);
  await call(
    `/admin/leads/${id}`,
    'PATCH',
    { revision: lead.revision, correo: null },
    400,
  );
  const phoneLead = await call(
    '/admin/leads',
    'POST',
    { telefono: '999111222' },
    201,
  );
  assert.equal(phoneLead.telefono, '+51999111222');
  await call(
    '/admin/leads',
    'POST',
    { correo: 'only@example.test', telefono: '999111222' },
    409,
  );
  const capture = {
    clave: randomUUID(),
    fuente: 'diagnostico',
    correo: 'ONLY@example.test',
    nombres: 'No reemplazar',
    consentimiento: true,
    canal: 'facebook',
    campana: 'R6',
  };
  await call('/captacion/perfiles', 'POST', capture, 201);
  await call('/captacion/perfiles', 'POST', capture, 201);
  assert.equal((await call(`/admin/leads/${id}`)).nombres, 'Confirmado');
  const turn = {
    idTurno: randomUUID(),
    mensaje: 'Estudio en otra universidad',
  };
  const bridge = { 'X-CRM-Secret': process.env.CRM_BRIDGE_SECRET };
  await call('/internal/tesi/begin', 'POST', turn, 401);
  await call('/internal/tesi/begin', 'POST', turn, 201, bridge);
  await call('/internal/tesi/begin', 'POST', turn, 201, bridge);
  const result = { state: { university: 'Sugerencia IA' }, reply: 'Anotado' };
  await call(
    '/internal/tesi/finish',
    'POST',
    { ...turn, respuesta: result.reply, resultadoJson: JSON.stringify(result) },
    201,
    bridge,
  );
  await call(
    '/internal/tesi/finish',
    'POST',
    { ...turn, respuesta: result.reply, resultadoJson: JSON.stringify(result) },
    201,
    bridge,
  );
  lead = await call(`/admin/leads/${id}`);
  assert.equal(lead.perfilAcademico.universidadOtra, 'Universidad confirmada');
  assert.equal(lead.conversaciones[0].totalMensajes, 2);
  assert.equal(lead.sugerencias.length, 1);
  await call(
    `/admin/leads/${id}/sugerencias/${lead.sugerencias[0].idSugerencia}`,
    'POST',
    { revision: lead.revision, accion: 'aceptar' },
    201,
  );
  lead = await call(`/admin/leads/${id}`);
  assert.equal(lead.perfilAcademico.universidadOtra, 'Sugerencia IA');
  const r7turn = { idTurno: randomUUID(), mensaje: 'Necesito análisis estadístico para mi tesis en desarrollo y quisiera saber el precio.' };
  const begun = await call('/internal/tesi/begin', 'POST', r7turn, 201, bridge);
  const msg = begun.evidencias.at(-1).idMensaje;
  const ev = [{ idMensaje: String(msg), fragmento: 'análisis estadístico' }];
  const r7result = { state: { need: 'análisis estadístico', thesisStage: 'desarrollo', service: 'puntual' }, reply: 'Orientación', interpretacionR7: { campos: { necesidad: { valor: 'análisis estadístico', evidencias: ev }, etapa: { valor: 'desarrollo', tipo: 'declarado', evidencias: [{ idMensaje: String(msg), fragmento: 'tesis en desarrollo' }] }, servicio: { valor: 'puntual', evidencias: ev } }, senales: { consulta_precio: { valor: true, evidencias: [{ idMensaje: String(msg), fragmento: 'saber el precio' }] } } } };
  const r7body = { ...r7turn, respuesta: r7result.reply, resultadoJson: JSON.stringify(r7result) };
  const bad = structuredClone(r7result);
  bad.interpretacionR7.campos.necesidad.evidencias[0].fragmento = 'cita inventada';
  await call('/internal/tesi/finish', 'POST', { ...r7body, resultadoJson: JSON.stringify(bad) }, 400, bridge);
  const [assistantMessage] = await db.query("SELECT id_mensaje,contenido FROM mensaje WHERE remitente='agente_ia' ORDER BY id_mensaje LIMIT 1");
  const wrongRole = structuredClone(r7result);
  wrongRole.interpretacionR7.campos.necesidad.evidencias[0] = { idMensaje: String(assistantMessage.id_mensaje), fragmento: assistantMessage.contenido };
  await call('/internal/tesi/finish', 'POST', { ...r7body, resultadoJson: JSON.stringify(wrongRole) }, 400, bridge);
  const [otherSession] = await db.query("INSERT INTO sesion_landing(canal_origen) VALUES('directo') RETURNING id_sesion");
  const [otherConversation] = await db.query("INSERT INTO conversacion(id_sesion,canal) VALUES($1,'web_chat') RETURNING id_conversacion", [otherSession.id_sesion]);
  const [otherMessage] = await db.query("INSERT INTO mensaje(id_conversacion,remitente,contenido) VALUES($1,'lead','análisis estadístico') RETURNING id_mensaje", [otherConversation.id_conversacion]);
  const wrongConversation = structuredClone(r7result);
  wrongConversation.interpretacionR7.campos.necesidad.evidencias[0].idMensaje = String(otherMessage.id_mensaje);
  await call('/internal/tesi/finish', 'POST', { ...r7body, resultadoJson: JSON.stringify(wrongConversation) }, 400, bridge);
  const qualified = await call('/internal/tesi/finish', 'POST', r7body, 201, bridge);
  assert.equal(qualified.resultado.calificacion.nivel, 'alto');
  assert.equal(qualified.resultado.calificacion.servicio, 'puntual');
  const [r8service] = await db.query("SELECT id_servicio FROM servicio WHERE codigo='puntual'");
  const [r8other] = await db.query("SELECT id_servicio FROM servicio WHERE codigo='etapas'");
  await call(`/admin/propuestas-comerciales/lead/${id}`, 'POST', {componentes:[{idServicio:r8service.id_servicio,cantidad:1}]}, 400);
  await call(`/admin/propuestas-comerciales/catalogo/servicios/${r8service.id_servicio}`, 'PUT', { precio:'125.50', moneda:'PEN', activo:true, plazoDias:7, entregables:['Asesoría'], condiciones:'Modalidad virtual', descuentoMax:0 });
  await call(`/admin/propuestas-comerciales/catalogo/servicios/${r8other.id_servicio}`, 'PUT', { precio:'100.00', moneda:'USD', activo:true, entregables:['Etapa'], condiciones:'Modalidad virtual', descuentoMax:0 });
  const twoLines = {componentes:[{idServicio:r8service.id_servicio,cantidad:1},{idServicio:r8other.id_servicio,cantidad:1}]};
  await call(`/admin/propuestas-comerciales/lead/${id}`, 'POST', twoLines, 400);
  await call(`/admin/propuestas-comerciales/catalogo/servicios/${r8other.id_servicio}`, 'PUT', { precio:'100.00', moneda:'PEN', activo:true, entregables:['Etapa'], condiciones:'Modalidad virtual', descuentoMax:0, revision:1 });
  await call('/admin/propuestas-comerciales/catalogo/incompatibilidad', 'PUT', {primero:r8service.id_servicio,segundo:r8other.id_servicio,incompatible:true});
  await call(`/admin/propuestas-comerciales/lead/${id}`, 'POST', twoLines, 400);
  const aiFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => String(url).includes('/api/internal/proposal') ? Response.json({error:'no disponible'},{status:503}) : aiFetch(url, init);
    const [{n:beforeR8}] = await db.query('SELECT count(*)::int n FROM r8_propuesta');
    await call(`/admin/propuestas-comerciales/lead/${id}`, 'POST', { componentes:[{idServicio:r8service.id_servicio,cantidad:1}] }, 503);
    assert.equal((await db.query('SELECT count(*)::int n FROM r8_propuesta'))[0].n,beforeR8);
    globalThis.fetch = async (url, init) => String(url).includes('/api/internal/proposal') ? Response.json({texto:'Acompañamiento para el análisis estadístico.',ids:[r8service.id_servicio]}) : aiFetch(url, init);
    const recommendation = await call(`/admin/propuestas-comerciales/lead/${id}/recomendaciones`, 'POST', {}, 201);
    assert.deepEqual(recommendation.ids,[r8service.id_servicio]);
    const proposal = await call(`/admin/propuestas-comerciales/lead/${id}`, 'POST', { componentes:[{idServicio:r8service.id_servicio,cantidad:2}], descuentoPorcentaje:10, motivoExcepcion:'Solicitud comercial' }, 201);
    assert.equal(proposal.contenido.total, '225.90');
    await call(`/admin/propuestas-comerciales/${proposal.idPropuesta}/acciones`, 'POST', { version:1, accion:'aprobar_excepcion' }, 201);
    const second = await call(`/admin/propuestas-comerciales/${proposal.idPropuesta}/lead/${id}`, 'PATCH', { revision:1, componentes:[{idServicio:r8service.id_servicio,cantidad:2}], descuentoPorcentaje:10, motivoExcepcion:'Solicitud comercial', textoManual:'Asesoría académica personalizada.' });
    assert.equal(second.version,2);
    await call(`/admin/propuestas-comerciales/${proposal.idPropuesta}/acciones`, 'POST', { version:1, accion:'revisar' }, 409);
    await call(`/admin/propuestas-comerciales/${proposal.idPropuesta}/acciones`, 'POST', { version:2, accion:'revisar' }, 409);
    const versions = await call(`/admin/propuestas-comerciales/${proposal.idPropuesta}`);
    assert.equal(versions.versiones.length,2);
    assert.equal(versions.versiones[1].contenido.total,'225.90');
    await call(`/admin/propuestas-comerciales/${proposal.idPropuesta}/acciones`, 'POST', { version:2, accion:'aprobar_excepcion' }, 201);
    await call(`/admin/propuestas-comerciales/${proposal.idPropuesta}/acciones`, 'POST', { version:2, accion:'revisar' }, 201);
    await call(`/admin/propuestas-comerciales/${proposal.idPropuesta}/acciones`, 'POST', { version:2, accion:'presentar' }, 201);
    await call(`/admin/propuestas-comerciales/${proposal.idPropuesta}/acciones`, 'POST', { version:2, accion:'aceptar' }, 201);
    const agreement = await call('/admin/contratos', 'POST', {idLead:id,idPropuestaR8:proposal.idPropuesta,fechaFirma:new Date().toISOString(),versionClausulas:'1.0',aceptaAutoriaEstudiante:true},201);
    assert.equal(agreement.idPropuesta, proposal.idPropuesta);
    assert.equal(agreement.propuesta.montoTotal, '225.90');
    const changes = await call(`/admin/propuestas-comerciales/lead/${id}`, 'POST', { componentes:[{idServicio:r8service.id_servicio,cantidad:1}] }, 201);
    await call('/admin/contratos', 'POST', {idLead:id,idPropuestaR8:changes.idPropuesta,fechaFirma:new Date().toISOString(),versionClausulas:'1.0',aceptaAutoriaEstudiante:true},409);
    await call(`/admin/propuestas-comerciales/${changes.idPropuesta}/acciones`, 'POST', {version:1,accion:'revisar'},201);
    await call(`/admin/propuestas-comerciales/${changes.idPropuesta}/acciones`, 'POST', {version:1,accion:'presentar'},201);
    await call(`/admin/propuestas-comerciales/${changes.idPropuesta}/acciones`, 'POST', {version:1,accion:'solicitar_cambios',motivo:'Ampliar alcance'},201);
    assert((await db.query('SELECT fecha_respuesta FROM propuesta WHERE id_propuesta=$1',[changes.idPropuesta]))[0].fecha_respuesta);
    const newVersion = await call(`/admin/propuestas-comerciales/${changes.idPropuesta}/lead/${id}`, 'PATCH', {revision:1,componentes:[{idServicio:r8service.id_servicio,cantidad:1}],textoManual:'Asesoría académica personalizada.'});
    assert.equal(newVersion.version,2);
  } finally { globalThis.fetch=aiFetch; }
  assert.equal(qualified.resultado.calificacion.campos.etapa.tipo, 'declarado');
  assert(qualified.resultado.quickReplies.includes('Confirmo necesidad: análisis estadístico'));
  await call('/internal/tesi/finish', 'POST', r7body, 201, bridge);
  lead = await call(`/admin/leads/${id}`);
  assert.equal(lead.calificaciones.length, 1);
  assert.equal(lead.perfilAcademico.universidadOtra, 'Sugerencia IA');
  const qualificationId = lead.calificaciones[0].idCalificacion;
  await call(`/admin/leads/${id}/calificaciones/${qualificationId}/revision`, 'POST', { revision: lead.revision, grupo: 'campos', campo: 'necesidad', accion: 'aceptar' }, 201);
  await call(`/admin/leads/${id}/calificaciones/${qualificationId}/revision`, 'POST', { revision: lead.revision, grupo: 'campos', campo: 'necesidad', accion: 'rechazar' }, 409);
  lead = await call(`/admin/leads/${id}`);
  assert.equal(lead.calificaciones[0].revisiones[0].accion, 'aceptar');
  assert.equal(lead.perfilAcademico.universidadOtra, 'Sugerencia IA');
  const exposed = await call(`/admin/leads/${id}/conversaciones/${lead.conversaciones[0].idConversacion}/calificacion`);
  assert.equal(exposed.resultado.nivel, 'alto');
  const confirmTurn = { idTurno: randomUUID(), mensaje: 'Confirmo necesidad: análisis estadístico' };
  const confirmBegin = await call('/internal/tesi/begin', 'POST', confirmTurn, 201, bridge);
  const confirmResult = { state: {}, reply: 'Gracias.', interpretacionR7: { campos: { necesidad: { valor: 'análisis estadístico', tipo: 'confirmado', evidencias: [...ev, { idMensaje: String(confirmBegin.evidencias.at(-1).idMensaje), fragmento: confirmTurn.mensaje }] } }, senales: {} } };
  const confirmed = await call('/internal/tesi/finish', 'POST', { ...confirmTurn, respuesta: confirmResult.reply, resultadoJson: JSON.stringify(confirmResult) }, 201, bridge);
  assert.equal(confirmed.resultado.calificacion.campos.necesidad.tipo, 'confirmado');
  const stageTurn = { idTurno: randomUUID(), mensaje: 'Confirmo etapa: desarrollo' };
  const stageBegin = await call('/internal/tesi/begin', 'POST', stageTurn, 201, bridge);
  const stageResult = { state: {}, reply: 'Gracias.', interpretacionR7: { campos: { etapa: { valor: 'desarrollo', tipo: 'confirmado', evidencias: [...r7result.interpretacionR7.campos.etapa.evidencias, { idMensaje: String(stageBegin.evidencias.at(-1).idMensaje), fragmento: stageTurn.mensaje }] } }, senales: {} } };
  const stageConfirmed = await call('/internal/tesi/finish', 'POST', { ...stageTurn, respuesta: stageResult.reply, resultadoJson: JSON.stringify(stageResult) }, 201, bridge);
  assert.equal(stageConfirmed.resultado.calificacion.campos.etapa.tipo, 'confirmado');
  const universityTurn = { idTurno: randomUUID(), mensaje: 'Mi universidad es Universidad Alternativa.' };
  const universityBegin = await call('/internal/tesi/begin', 'POST', universityTurn, 201, bridge);
  const universityEvidence = [{ idMensaje: String(universityBegin.evidencias.at(-1).idMensaje), fragmento: 'Universidad Alternativa' }];
  const universityResult = { state: { university: 'Universidad Alternativa' }, reply: 'Anotado.', interpretacionR7: { campos: { universidad: { valor: 'Universidad Alternativa', tipo: 'declarado', evidencias: universityEvidence } }, senales: {} } };
  const universitySaved = await call('/internal/tesi/finish', 'POST', { ...universityTurn, respuesta: universityResult.reply, resultadoJson: JSON.stringify(universityResult) }, 201, bridge);
  assert.equal(universitySaved.resultado.calificacion.campos.universidad.tipo, 'declarado');
  assert(universitySaved.resultado.quickReplies.includes('Confirmo universidad: Universidad Alternativa'));
  assert.equal((await call(`/admin/leads/${id}`)).perfilAcademico.universidadOtra, 'Sugerencia IA');
  const packageCatalogs = await call('/admin/paquetes/catalogos');
  const puntual = packageCatalogs.servicios.find(s => s.codigo === 'puntual');
  assert(puntual);
  const pkg = await call('/admin/paquetes', 'POST', {
    codigo: 'R7_PAQUETE', nombre: 'Paquete de prueba', descripcion: 'Asesoría estadística', publicoObjetivo: null,
    componentes: [{ idServicio: puntual.idServicio, cantidad: 1 }],
    entregables: ['Informe'], restricciones: ['Sujeto a evaluación'], precioFijo: '250.00', moneda: 'PEN', modalidad: 'virtual',
    duracionDias: null, vigenciaDesde: null, vigenciaHasta: null, estado: 'activo',
  }, 201);
  await call(`/admin/propuestas-comerciales/catalogo/paquetes/${pkg.idServicio}/opcionales`, 'PUT', {servicios:[r8other.id_servicio]}, 400);
  await call('/admin/propuestas-comerciales/catalogo/incompatibilidad', 'PUT', {primero:r8service.id_servicio,segundo:r8other.id_servicio,incompatible:false});
  await call(`/admin/propuestas-comerciales/catalogo/paquetes/${pkg.idServicio}/opcionales`, 'PUT', {servicios:[r8other.id_servicio]});
  const packageFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => String(url).includes('/api/internal/proposal') ? Response.json({texto:'Asesoría académica personalizada.',ids:[r8service.id_servicio,r8other.id_servicio]}) : packageFetch(url, init);
    const composed = await call(`/admin/propuestas-comerciales/lead/${id}`, 'POST', {idPaquete:pkg.idServicio,versionPaquete:pkg.version,componentes:[{idServicio:r8service.id_servicio,cantidad:1},{idServicio:r8other.id_servicio,cantidad:1}]}, 201);
    assert.equal(composed.contenido.total,'225.50');
    assert.equal(composed.contenido.componentes.length,2);
  } finally { globalThis.fetch=packageFetch; }
  const pkgTurn = { idTurno: randomUUID(), mensaje: 'Quiero revisar el paquete de estadística.' };
  const pkgBegin = await call('/internal/tesi/begin', 'POST', pkgTurn, 201, bridge);
  const pkgId = `paquete-${pkg.idServicio}`;
  const pkgResult = { state: { service: pkgId, packageVersion: pkg.version }, reply: 'Paquete disponible.', interpretacionR7: { campos: { servicio: { valor: pkgId, evidencias: [{ idMensaje: String(pkgBegin.evidencias.at(-1).idMensaje), fragmento: pkgTurn.mensaje }] } }, senales: {} } };
  const pkgSaved = await call('/internal/tesi/finish', 'POST', { ...pkgTurn, respuesta: pkgResult.reply, resultadoJson: JSON.stringify(pkgResult) }, 201, bridge);
  assert.equal(pkgSaved.resultado.calificacion.servicio, pkgId);
  if (process.env.R7_INTEGRATION === '1') {
    const priorVisitor = visitor, oldFetch = globalThis.fetch;
    const envNames = ['CRM_API_URL', 'API_PROXY_TARGET', 'AI_PROVIDER', 'GEMINI_API_KEY', 'OPENAI_API_KEY'];
    const oldEnv = Object.fromEntries(envNames.map(key => [key, process.env[key]]));
    try {
      visitor = '';
      await call('/captacion/perfiles', 'POST', { ...capture, clave: randomUUID() }, 201);
      process.env.CRM_API_URL = base; process.env.API_PROXY_TARGET = base;
      process.env.AI_PROVIDER = 'gemini'; process.env.GEMINI_API_KEY = 'test-only'; delete process.env.OPENAI_API_KEY;
      globalThis.fetch = async (url, init) => {
        if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return oldFetch(url, init);
        const request = JSON.parse(init.body), input = JSON.parse(request.contents[0].parts[0].text);
        const isCommercial = !!request.generationConfig.responseJsonSchema.properties.campos;
        const messageId = isCommercial ? input.mensajes.at(-1).idMensaje : null;
        const evidence = (fragmento) => [{ idMensaje: messageId, fragmento }];
        const result = isCommercial ? {
          campos: [
            { nombre:'necesidad', valor:'análisis estadístico', tipo:'declarado', evidencias:evidence('análisis estadístico') },
            { nombre:'etapa', valor:'desarrollo', tipo:'declarado', evidencias:evidence('tesis en desarrollo') },
            { nombre:'servicio', valor:pkgId, tipo:'inferido', evidencias:evidence('análisis estadístico') },
          ], senales:[{nombre:'consulta_precio',valor:'true',tipo:'inferido',evidencias:evidence('precio')}], objeciones:[],
        } : { kind:'business', name:null, university:null, degree:'maestría', thesisStage:'desarrollo', need:'análisis estadístico', deadline:null, service:pkgId, intent:'unchanged', human:false, objection:'none' };
        return Response.json({ candidates:[{ finishReason:'STOP', content:{ parts:[{text:JSON.stringify(result)}] } }] });
      };
      const landing = fileURLToPath(new URL('../../tesispro-landing/', import.meta.url));
      const requireLanding = createRequire(new URL('../../tesispro-landing/package.json', import.meta.url));
      const { build } = createRequire(requireLanding.resolve('astro/package.json'))('esbuild');
      const bundled = await build({ entryPoints:[`${landing}/src/pages/api/negotiation.ts`], bundle:true, platform:'node', format:'esm', write:false, define:{'import.meta.env':JSON.stringify({DEV:false})} });
      const endpoint = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
      const initial = { stage:'START', name:'', university:'', degree:'', thesisStage:'', need:'', deadline:'', service:null, objections:[], discount:0, buyIntent:false, humanRequested:false };
      const message = 'Necesito análisis estadístico para mi tesis en desarrollo de maestría y quiero saber el precio';
      const request = new Request('http://localhost:4321/api/negotiation', {method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:4321',Cookie:visitor},body:JSON.stringify({idTurno:randomUUID(),message,history:[],state:initial})});
      const response = await endpoint.POST({request});
      const data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      assert.equal(data.calificacion.nivel, 'alto');
      assert.equal(data.calificacion.campos.necesidad.valor, 'análisis estadístico');
      assert.equal(data.calificacion.campos.necesidad.evidencias[0].fragmento, 'análisis estadístico');
      assert.equal(data.calificacion.servicio, pkgId);
      assert.equal((await call(`/admin/leads/${id}`)).calificaciones[0].resultado.nivel, 'alto');
      const simulatedFetch = globalThis.fetch;
      const retryTurn = randomUUID();
      const retryRequest = () => new Request('http://localhost:4321/api/negotiation', {method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:4321',Cookie:visitor},body:JSON.stringify({idTurno:retryTurn,message,history:[],state:initial})});
      globalThis.fetch = async (url, init) => String(url).startsWith('https://generativelanguage.googleapis.com/') ? Response.json({error:{message:'temporary'}},{status:503}) : oldFetch(url, init);
      assert.equal((await endpoint.POST({request:retryRequest()})).status, 503);
      const [failed] = await db.query('SELECT id_mensaje,respuesta FROM turno_tesi WHERE id_turno=$1', [retryTurn]);
      assert(failed && failed.respuesta === null);
      assert.equal((await db.query('SELECT count(*)::int n FROM calificacion_tesi WHERE id_turno=$1', [retryTurn]))[0].n, 0);
      globalThis.fetch = simulatedFetch;
      assert.equal((await endpoint.POST({request:retryRequest()})).status, 200);
      assert.equal((await db.query('SELECT count(*)::int n FROM turno_tesi WHERE id_turno=$1', [retryTurn]))[0].n, 1);
      console.log('OK R7: Tesi, proveedor simulado, puente y PostgreSQL con evidencia.');
    } finally {
      globalThis.fetch = oldFetch; visitor = priorVisitor;
      for (const key of envNames) if (oldEnv[key] === undefined) delete process.env[key]; else process.env[key] = oldEnv[key];
    }
  }
  const mismatchTurn = { idTurno: randomUUID(), mensaje: 'En realidad necesito acompañamiento integral.' };
  const mismatchBegin = await call('/internal/tesi/begin', 'POST', mismatchTurn, 201, bridge);
  const mismatchEvidence = [{ idMensaje: String(mismatchBegin.evidencias.at(-1).idMensaje), fragmento: 'acompañamiento integral' }];
  const mismatchResult = { state: { service: pkgId, packageVersion: pkg.version }, reply: 'Paquete disponible.', interpretacionR7: { campos: { necesidad: { valor: 'acompañamiento integral', evidencias: mismatchEvidence }, servicio: { valor: pkgId, evidencias: mismatchEvidence } }, senales: {} } };
  const mismatch = await call('/internal/tesi/finish', 'POST', { ...mismatchTurn, respuesta: mismatchResult.reply, resultadoJson: JSON.stringify(mismatchResult) }, 201, bridge);
  assert.equal(mismatch.resultado.calificacion.servicio, null);
  await call(`/admin/paquetes/${pkg.idServicio}/estado`, 'PATCH', { estado: 'inactivo', version: pkg.version });
  const expiredTurn = { idTurno: randomUUID(), mensaje: '¿Sigue disponible el paquete de estadística?' };
  const expiredBegin = await call('/internal/tesi/begin', 'POST', expiredTurn, 201, bridge);
  const expiredResult = { state: { service: pkgId, packageVersion: pkg.version }, reply: 'Paquete disponible.', interpretacionR7: { campos: { servicio: { valor: pkgId, evidencias: [{ idMensaje: String(expiredBegin.evidencias.at(-1).idMensaje), fragmento: expiredTurn.mensaje }] } }, senales: {} } };
  const expired = await call('/internal/tesi/finish', 'POST', { ...expiredTurn, respuesta: expiredResult.reply, resultadoJson: JSON.stringify(expiredResult) }, 201, bridge);
  assert.equal(expired.resultado.calificacion.servicio, null);
  assert.equal(expired.resultado.state.service, null);
  const humanTurn = { idTurno: randomUUID(), mensaje: 'Quiero hablar con un asesor' };
  const humanBegin = await call('/internal/tesi/begin', 'POST', humanTurn, 201, bridge);
  const humanResult = { state: { humanRequested: true }, reply: 'Puedes continuar con un asesor.', interpretacionR7: { campos: {}, senales: { solicita_asesor: { valor: true, evidencias: [{ idMensaje: String(humanBegin.evidencias.at(-1).idMensaje), fragmento: humanTurn.mensaje }] } } } };
  const humanBody = { ...humanTurn, respuesta: humanResult.reply, resultadoJson: JSON.stringify(humanResult) };
  await call('/internal/tesi/finish', 'POST', humanBody, 201, bridge);
  await call('/internal/tesi/finish', 'POST', humanBody, 201, bridge);
  lead = await call(`/admin/leads/${id}`);
  assert.equal(lead.derivaciones.length, 1);
  const intentTurn = { idTurno: randomUUID(), mensaje: 'Quiero contratar el servicio.' };
  const intentBegin = await call('/internal/tesi/begin', 'POST', intentTurn, 201, bridge);
  const intentResult = { state: {}, reply: 'Entendido.', interpretacionR7: { campos: {}, senales: { intencion_contratar: { valor: true, evidencias: [{ idMensaje: String(intentBegin.evidencias.at(-1).idMensaje), fragmento: 'Quiero contratar' }] } } } };
  const intent = await call('/internal/tesi/finish', 'POST', { ...intentTurn, respuesta: intentResult.reply, resultadoJson: JSON.stringify(intentResult) }, 201, bridge);
  assert.equal(intent.resultado.calificacion.nivel, 'intencion_contratacion');
  const rejectionTurn = { idTurno: randomUUID(), mensaje: 'No quiero contratar, solo estoy consultando.' };
  const rejectionBegin = await call('/internal/tesi/begin', 'POST', rejectionTurn, 201, bridge);
  const rejectionResult = { state: {}, reply: 'Entendido.', interpretacionR7: { campos: {}, senales: { intencion_contratar: { valor: false, evidencias: [{ idMensaje: String(rejectionBegin.evidencias.at(-1).idMensaje), fragmento: 'No quiero contratar' }] } } } };
  const rejected = await call('/internal/tesi/finish', 'POST', { ...rejectionTurn, respuesta: rejectionResult.reply, resultadoJson: JSON.stringify(rejectionResult) }, 201, bridge);
  assert.notEqual(rejected.resultado.calificacion.nivel, 'intencion_contratacion');
  await call(`/admin/leads/${id}/derivaciones/${lead.derivaciones[0].idDerivacion}`, 'PATCH', { revision: lead.revision, estado: 'en_atencion' });
  lead = await call(`/admin/leads/${id}`);
  assert.equal(lead.derivaciones[0].estado, 'en_atencion');
  await call(
    `/admin/leads/${id}/seguimientos`,
    'POST',
    {
      revision: lead.revision,
      fechaProgramada: new Date(Date.now() - 1000).toISOString(),
      mensaje: 'Llamar mañana',
    },
    201,
  );
  const events = await call(`/admin/leads/${id}/interacciones?pageSize=100`);
  assert(events.total >= 5);
  const audit = events.items.find((event) =>
    event.tipo === 'perfil_editado' && event.detalle.antes?.laboral?.horas_libres_semana === 5,
  );
  assert.equal(audit?.detalle.despues?.laboral?.horas_libres_semana, 0);
  const summary = await call('/admin/resumen');
  assert(summary.seguimiento.vencidos >= 1);
  assert.equal((await call('/admin/leads?origen=facebook')).total, 1);
  await call(
    '/perfil-laboral',
    'POST',
    { idLead: id, ocupacion: 'Bypass' },
    404,
  );
  const anonymousHeaders = { Cookie: '' };
  const concurrent = await Promise.all([
    call(
      '/captacion/perfiles',
      'POST',
      {
        clave: randomUUID(),
        fuente: 'consulta',
        telefono: '999111333',
        consentimiento: true,
      },
      201,
      anonymousHeaders,
    ),
    call(
      '/captacion/perfiles',
      'POST',
      {
        clave: randomUUID(),
        fuente: 'consulta',
        telefono: '+51 999 111 333',
        consentimiento: true,
      },
      201,
      anonymousHeaders,
    ),
  ]);
  assert.equal(concurrent.length, 2);
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM buyer WHERE telefono='+51999111333'",
      )
    )[0].n,
    1,
  );
  // Legacy duplicates must abort the migration without silently merging rows.
  const legacySchema = `${schema}_legacy`;
  let legacy;
  try {
    await control.query(`CREATE SCHEMA ${legacySchema}`);
    const names = (await readdir(new URL('../dist/migrations/', import.meta.url)))
      .filter((name) => name.endsWith('.js') && !name.includes('LeadProfiling') && !name.includes('TesiQualification'));
    const migrations = await Promise.all(names.map(async (name) => Object.values(await import(`../dist/migrations/${name}`))[0]));
    legacy = new DataSource({ ...source.options, schema: legacySchema, migrations, extra: {options:`-c search_path=${legacySchema}`} });
    await legacy.initialize(); await legacy.runMigrations();
    await legacy.query("INSERT INTO lead(nombres,correo,telefono,id_estado) VALUES('Uno','legacy1@example.test','999222333',(SELECT id_estado FROM estado_lead WHERE codigo='nuevo')),('Dos','legacy2@example.test','+51999222333',(SELECT id_estado FROM estado_lead WHERE codigo='nuevo'))");
    const runner = legacy.createQueryRunner(); await runner.connect(); await runner.startTransaction();
    try { await assert.rejects(() => new LeadProfiling1792500000000().up(runner)); await runner.rollbackTransaction(); }
    finally { if(runner.isTransactionActive) await runner.rollbackTransaction(); await runner.release(); }
    assert.equal((await legacy.query('SELECT count(*)::int AS n FROM lead'))[0].n,2);
    assert.equal((await legacy.query("SELECT to_regclass('contacto_identidad') AS name"))[0].name,null);
  } finally {
    if(legacy?.isInitialized)await legacy.destroy();
    await control.query(`DROP SCHEMA IF EXISTS ${legacySchema} CASCADE`);
  }
  const buyer = (
    await db.query("SELECT * FROM buyer WHERE telefono='+51999111333'")
  )[0];
  const states = await call('/admin/catalogos');
  await call(
    `/admin/buyers/${buyer.id_buyer}`,
    'PATCH',
    {
      revision: buyer.revision,
      nombres: 'Buyer',
      telefono: buyer.telefono,
      correo: null,
      canalOrigen: 'directo',
      fechaRegistro: new Date().toISOString(),
      motivoCaptacion: 'consulta_general',
      estado: 'lead',
      idEstadoLead: states.estados[0].idEstado,
      motivoConversion: 'R6',
    },
    200,
  );
  assert.equal(
    (
      await db.query('SELECT id_lead FROM contacto_identidad WHERE valor=$1', [
        buyer.telefono,
      ])
    )[0].id_lead !== null,
    true,
  );
  visitor = '';
  await call('/captacion/sesion', 'POST', {}, 201);
  const objectionTurn = { idTurno: randomUUID(), mensaje: 'Me parece caro.' };
  const objectionBegin = await call('/internal/tesi/begin', 'POST', objectionTurn, 201, bridge);
  const objection = { state: {}, reply: 'Lo entiendo.', interpretacionR7: { campos: {}, senales: {}, objeciones: { precio: { valor: 'caro', tipo: 'declarado', evidencias: [{ idMensaje: String(objectionBegin.evidencias.at(-1).idMensaje), fragmento: 'caro' }] } } } };
  const objectionSaved = await call('/internal/tesi/finish', 'POST', { ...objectionTurn, respuesta: objection.reply, resultadoJson: JSON.stringify(objection) }, 201, bridge);
  assert.equal(objectionSaved.resultado.calificacion.nivel, 'bajo');
  assert.equal(objectionSaved.resultado.calificacion.objeciones.precio.tipo, 'declarado');
  const [anonymousConversation] = await db.query('SELECT id_conversacion FROM turno_tesi WHERE id_turno=$1', [objectionTurn.idTurno]);
  const anonymousEvaluation = await call(`/admin/conversaciones/${anonymousConversation.id_conversacion}/calificacion`);
  assert.equal(anonymousEvaluation.idLead, null);
  assert.equal(anonymousEvaluation.resultado.objeciones.precio.valor, 'caro');
  const unauthorizedEvaluation = await fetch(`${base}/admin/conversaciones/${anonymousConversation.id_conversacion}/calificacion`);
  assert.equal(unauthorizedEvaluation.status, 401);
  visitor = '';
  const contact = {
    clave: randomUUID(),
    fuente: 'consulta',
    nombres: 'Reserva',
    correo: 'booking@example.test',
    telefono: '999111444',
    consentimiento: true,
  };
  let available;
  for (let i = 1; i < 8; i++) {
    const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
    const data = await call(
      '/captacion/reuniones/disponibilidad?fecha=' + date,
    );
    if (data.horarios.length) {
      available = data.horarios[0];
      break;
    }
  }
  const booking = { ...contact, fechaInicio: available };
  await call('/captacion/reuniones', 'POST', booking, 201);
  await call('/captacion/reuniones', 'POST', booking, 201);
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS n FROM reunion WHERE clave_idempotencia=$1',
        [contact.clave],
      )
    )[0].n,
    1,
  );
  if (process.env.R6_UI === '1') {
    const landing = fileURLToPath(
      new URL('../../tesispro-landing/', import.meta.url),
    );
    const { chromium } = createRequire(
      new URL('../../tesispro-landing/package.json', import.meta.url),
    )('@playwright/test');
    process.env.CRM_API_URL=base;
    process.env.API_PROXY_TARGET=base;
    if(process.env.R7_UI==='1') {
      process.env.AI_PROVIDER='gemini';process.env.GEMINI_API_KEY='test-only';process.env.GEMINI_MODEL='test-model';process.env.OPENAI_API_KEY='';
      await import('./r7-ai-mock.mjs');
    }
    uiProxy=await developmentUiProxy(base,process.env.TEST_UI_TARGET||'http://localhost:4321');
    const origin=uiProxy.origin;
    process.env.APP_ORIGIN=origin;
    process.env.R8_AI_URL=origin+'/api/internal/proposal';
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin + '/');
    const auth = await page.evaluate(async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correo: 'r6@example.test',
          password: 'profile-test-123',
        }),
      });
      return r.status;
    });
    assert.equal(auth, 200, 'Inicio de sesión por el proxy de producción');
    await page.goto(origin + '/admin/leads?q=only%40example.test');
    await page
      .getByRole('button', { name: 'Ver Confirmado' })
      .click({ timeout: 20000 });
    await page
      .getByRole('heading', { name: 'Contexto y seguimiento' })
      .waitFor();
    await page.getByRole('button', { name: 'Editar contexto' }).click();
    await page.getByLabel('Ocupación', { exact: true }).fill('Investigadora');
    await page.getByRole('button', { name: 'Guardar contexto' }).click();
    await page.getByText('Investigadora', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByRole('button', { name: 'Ver Confirmado' }).click();
    await page.getByText('Investigadora', { exact: true }).waitFor();
    if(process.env.R7_UI==='1') {
      const commercial=await call('/admin/propuestas-comerciales/catalogo');
      const selectedService=commercial.servicios.find(s=>s.idServicio===r8service.id_servicio);
      await page.getByRole('checkbox',{name:new RegExp(selectedService.nombre)}).check();
      const generating=page.waitForResponse(r=>r.url().endsWith(`/propuestas-comerciales/lead/${id}`)&&r.request().method()==='POST');
      await page.getByRole('button',{name:'Generar borrador con IA',exact:true}).click();
      const generated=await generating;
      assert.equal(generated.status(),201,await generated.text());
      const generatedBody=await generated.json();
      assert.equal(generatedBody.contenido.total,selectedService.precio);
      for(const [action,label] of [['revisar','Marcar revisada'],['presentar','Registrar presentación'],['aceptar','Registrar aceptación']]) {
        const response=page.waitForResponse(r=>r.url().endsWith('/acciones')&&r.request().postDataJSON()?.accion===action);
        await page.getByRole('button',{name:label,exact:true}).click();
        const decided=await response;assert.equal(decided.status(),201,await decided.text());
      }
      await page.getByLabel('Fecha de firma',{exact:true}).fill('2026-11-01T10:00');
      await page.getByLabel('Versión de cláusulas',{exact:true}).fill('1.0');
      await page.getByRole('checkbox',{name:'Se confirmó la autoría del estudiante'}).check();
      const contractCreated=page.waitForResponse(r=>r.url().endsWith('/api/admin/contratos')&&r.request().method()==='POST');
      await page.getByRole('button',{name:'Registrar contrato',exact:true}).click();
      const signed=await contractCreated;assert.equal(signed.status(),201,await signed.text());
      const signedBody=await signed.json();assert.equal(signedBody.idPropuesta,generatedBody.idPropuesta);assert.equal(signedBody.montoTotal,selectedService.precio);
      await page.getByRole('button',{name:'Cerrar',exact:true}).click();
      await page.getByRole('button',{name:'Ver Confirmado',exact:true}).click();
      await page.getByLabel('Abrir propuesta existente por ID').fill(generatedBody.idPropuesta);
      await page.getByText(`Propuesta #${generatedBody.idPropuesta} · Aceptada · versión 1`,{exact:true}).waitFor();
      assert.equal((await call(`/admin/propuestas-comerciales/${generatedBody.idPropuesta}`)).estado,'aceptada');
      console.log('OK Navegador R8: borrador IA, importes del catálogo, revisión, presentación, aceptación, contrato y reapertura.');
    }
    await page.goto(origin + '/evaluacion');
    const availableNext = await call(
      '/captacion/reuniones/disponibilidad?fecha=' + available.slice(0, 10),
    );
    assert(availableNext.horarios.length > 0);
    await page.locator('#booking-date').fill(available.slice(0, 10));
    await page.waitForFunction(
      () => document.querySelectorAll('#booking-slot option').length > 1,
    );
    await page.locator('#booking-slot').selectOption({ index: 1 });
    await page.locator('#booking-name').fill('Reserva navegador');
    await page.locator('#booking-phone').fill('999111555');
    await page.locator('#booking-email').fill('navegador@example.test');
    await page.locator('#booking-consent').check();
    await page.locator('#live-booking-form button[type=submit]').click();
    await page
      .getByText(/Tu reunión quedó confirmada/)
      .waitFor({ timeout: 15000 });
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM reunion WHERE correo='navegador@example.test'",
        )
      )[0].n,
      1,
    );
    await page.goto(origin + '/');
    const turnResult = await page.evaluate(async () => {
      const state = {
        stage: 'START',
        name: '',
        university: '',
        degree: '',
        thesisStage: '',
        need: '',
        deadline: '',
        service: null,
        objections: [],
        discount: 0,
        buyIntent: false,
        humanRequested: false,
      };
      const response = await fetch('/api/negotiation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idTurno: crypto.randomUUID(),
          message: 'Hola',
          history: [],
          state,
        }),
      });
      return { status: response.status, body: await response.json() };
    });
    assert.equal(turnResult.status, 200, JSON.stringify(turnResult.body));
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM conversacion c JOIN lead l USING(id_lead) WHERE l.correo='navegador@example.test'",
        )
      )[0].n,
      1,
    );
    const resetStatus = await page.evaluate(async () => (await fetch('/api/negotiation', { method: 'DELETE' })).status);
    assert.equal(resetStatus, 200);
    const secondTurn = await page.evaluate(async () => {
      const state = { stage:'START', name:'', university:'', degree:'', thesisStage:'', need:'', deadline:'', service:null, objections:[], discount:0, buyIntent:false, humanRequested:false };
      return (await fetch('/api/negotiation', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idTurno:crypto.randomUUID(),message:'Hola',history:[],state}) })).status;
    });
    assert.equal(secondTurn, 200);
    assert.equal((await db.query("SELECT count(*)::int n FROM conversacion c JOIN lead l USING(id_lead) WHERE l.correo='navegador@example.test'"))[0].n,2);
    if (process.env.R7_UI === '1') {
      const r7browser = await page.evaluate(async () => {
        const state = { stage:'START', name:'', university:'', degree:'', thesisStage:'', need:'', deadline:'', service:null, objections:[], discount:0, buyIntent:false, humanRequested:false };
        const response = await fetch('/api/negotiation', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ idTurno:crypto.randomUUID(), message:'Necesito análisis estadístico para mi tesis en desarrollo de maestría y quiero saber el precio', history:[], state }) });
        return { status:response.status, body:await response.json() };
      });
      assert.equal(r7browser.status, 200, JSON.stringify(r7browser.body));
      assert.equal(r7browser.body.calificacion.nivel, 'alto');
      const [profileId] = await db.query("SELECT id_lead FROM lead WHERE correo='navegador@example.test'");
      const crmProfile = await call(`/admin/leads/${profileId.id_lead}`);
      assert.equal(crmProfile.calificaciones[0].resultado.campos.necesidad.valor, 'análisis estadístico');
      assert.equal(crmProfile.calificaciones[0].resultado.campos.necesidad.evidencias[0].fragmento, 'análisis estadístico');
    }
    const visitorPage = await browser.newPage();
    await visitorPage.addInitScript(() => { window.open = () => null; });
    await visitorPage.goto(origin + '/');
    const anonymousTurn = await visitorPage.evaluate(async () => {
      const state = { stage:'START', name:'', university:'', degree:'', thesisStage:'', need:'', deadline:'', service:null, objections:[], discount:0, buyIntent:false, humanRequested:false };
      return (await fetch('/api/negotiation', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idTurno:crypto.randomUUID(),message:'Hola',history:[],state}) })).status;
    });
    assert.equal(anonymousTurn, 200);
    if (process.env.R7_UI === '1') {
      const anonymousR7 = await visitorPage.evaluate(async () => {
        const state = { stage:'START', name:'', university:'', degree:'', thesisStage:'', need:'', deadline:'', service:null, objections:[], discount:0, buyIntent:false, humanRequested:false };
        return (await fetch('/api/negotiation', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ idTurno:crypto.randomUUID(), message:'Necesito análisis estadístico para mi tesis en desarrollo de maestría y quiero saber el precio', history:[], state }) })).status;
      });
      assert.equal(anonymousR7, 200);
    }
    for (let i=0;i<3;i++) await visitorPage.locator('#hero-widget-next-btn').click();
    await visitorPage.locator('#hero-widget-name').fill('Diagnóstico navegador');
    await visitorPage.locator('#hero-widget-phone').fill('999111666');
    await visitorPage.locator('#hero-consent').check();
    const captured = visitorPage.waitForResponse(response => response.url().endsWith('/api/captacion/perfiles') && response.request().method()==='POST');
    await visitorPage.locator('#hero-widget-next-btn').click();
    assert.equal((await captured).status(),201);
    const [capturedBuyer] = await db.query("SELECT * FROM buyer WHERE telefono='+51999111666'");
    assert(capturedBuyer);
    const buyerEvents = await call(`/admin/buyers/${capturedBuyer.id_buyer}/interacciones`);
    assert(buyerEvents.items.some(event => event.tipo==='mensaje'));
    assert(buyerEvents.items.some(event => event.tipo==='captacion' && event.detalle.grado));
    const converted = await call(`/admin/buyers/${capturedBuyer.id_buyer}`,'PATCH',{
      revision:capturedBuyer.revision,nombres:capturedBuyer.nombres,telefono:capturedBuyer.telefono,correo:null,
      canalOrigen:capturedBuyer.canal_origen,fechaRegistro:new Date(capturedBuyer.fecha_registro).toISOString(),motivoCaptacion:'consulta_general',
      estado:'lead',idEstadoLead:states.estados[0].idEstado,motivoConversion:'Consulta de diagnóstico',
    });
    const convertedProfile=await call(`/admin/leads/${converted.idLead}`);
    assert.equal(convertedProfile.conversaciones[0].totalMensajes,process.env.R7_UI === '1' ? 4 : 2);
    if (process.env.R7_UI === '1') assert.equal(convertedProfile.calificaciones[0].resultado.campos.necesidad.valor, 'análisis estadístico');
    await visitorPage.close();
    assert.deepEqual(errors, [], 'Errores de JavaScript en el navegador');
    console.log(
      'OK Navegador: proxy, login, edición persistente, reserva y conversación de Tesi vinculada.',
    );
  }
  console.log(
    'OK R6/R8: perfil, identidad, Tesi, evidencia, catálogo, precios, incompatibilidades, versiones, excepciones y contratación.',
  );
} finally {
  if (browser) await browser.close();
  if (uiProxy) await uiProxy.close();
  if (app) await app.close();
  if (db?.isInitialized) await db.destroy();
  if (control.isInitialized) {
    await control.query(`DROP SCHEMA ${schema} CASCADE`);
    await control.destroy();
  }
}
