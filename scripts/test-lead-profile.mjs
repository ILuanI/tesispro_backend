import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import source from '../dist/database/typeorm.config.js';
import { AdminModule } from '../dist/modules/admin/admin.module.js';
import { passwordHash } from '../dist/modules/admin/auth.js';
import { LeadProfiling1792500000000 } from '../dist/migrations/1792500000000-LeadProfiling.js';

const schema = 'r6_test_' + randomBytes(8).toString('hex');
const control = new DataSource({ ...source.options, migrations: [] });
let db, app, frontend, browser;
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
  const r7result = { state: { need: 'análisis estadístico', thesisStage: 'desarrollo', service: 'puntual' }, reply: 'Orientación', interpretacionR7: { campos: { necesidad: { valor: 'análisis estadístico', evidencias: ev }, etapa: { valor: 'desarrollo', evidencias: [{ idMensaje: String(msg), fragmento: 'tesis en desarrollo' }] }, servicio: { valor: 'puntual', evidencias: ev } }, senales: { consulta_precio: { valor: true, evidencias: [{ idMensaje: String(msg), fragmento: 'saber el precio' }] } } } };
  const r7body = { ...r7turn, respuesta: r7result.reply, resultadoJson: JSON.stringify(r7result) };
  const bad = structuredClone(r7result);
  bad.interpretacionR7.campos.necesidad.evidencias[0].fragmento = 'cita inventada';
  await call('/internal/tesi/finish', 'POST', { ...r7body, resultadoJson: JSON.stringify(bad) }, 400, bridge);
  const [assistantMessage] = await db.query("SELECT id_mensaje,contenido FROM mensaje WHERE remitente='agente_ia' ORDER BY id_mensaje LIMIT 1");
  const wrongRole = structuredClone(r7result);
  wrongRole.interpretacionR7.campos.necesidad.evidencias[0] = { idMensaje: String(assistantMessage.id_mensaje), fragmento: assistantMessage.contenido };
  await call('/internal/tesi/finish', 'POST', { ...r7body, resultadoJson: JSON.stringify(wrongRole) }, 400, bridge);
  const qualified = await call('/internal/tesi/finish', 'POST', r7body, 201, bridge);
  assert.equal(qualified.resultado.calificacion.nivel, 'alto');
  assert.equal(qualified.resultado.calificacion.servicio, 'puntual');
  assert(qualified.resultado.quickReplies.includes('Confirmo: análisis estadístico'));
  await call('/internal/tesi/finish', 'POST', r7body, 201, bridge);
  lead = await call(`/admin/leads/${id}`);
  assert.equal(lead.calificaciones.length, 1);
  assert.equal(lead.perfilAcademico.universidadOtra, 'Sugerencia IA');
  const exposed = await call(`/admin/leads/${id}/conversaciones/${lead.conversaciones[0].idConversacion}/calificacion`);
  assert.equal(exposed.resultado.nivel, 'alto');
  const confirmTurn = { idTurno: randomUUID(), mensaje: 'Confirmo: análisis estadístico' };
  const confirmBegin = await call('/internal/tesi/begin', 'POST', confirmTurn, 201, bridge);
  const confirmResult = { state: {}, reply: 'Gracias.', interpretacionR7: { campos: { necesidad: { valor: 'análisis estadístico', tipo: 'confirmado', evidencias: [...ev, { idMensaje: String(confirmBegin.evidencias.at(-1).idMensaje), fragmento: confirmTurn.mensaje }] } }, senales: {} } };
  const confirmed = await call('/internal/tesi/finish', 'POST', { ...confirmTurn, respuesta: confirmResult.reply, resultadoJson: JSON.stringify(confirmResult) }, 201, bridge);
  assert.equal(confirmed.resultado.calificacion.campos.necesidad.tipo, 'confirmado');
  const packageCatalogs = await call('/admin/paquetes/catalogos');
  const pkg = await call('/admin/paquetes', 'POST', {
    codigo: 'R7_PAQUETE', nombre: 'Paquete de prueba', descripcion: 'Asesoría estadística', publicoObjetivo: null,
    componentes: [{ idServicio: packageCatalogs.servicios[0].idServicio, cantidad: 1 }],
    entregables: ['Informe'], restricciones: ['Sujeto a evaluación'], precioFijo: '250.00', moneda: 'PEN', modalidad: 'virtual',
    duracionDias: null, vigenciaDesde: null, vigenciaHasta: null, estado: 'activo',
  }, 201);
  const pkgTurn = { idTurno: randomUUID(), mensaje: 'Quiero revisar el paquete de estadística.' };
  const pkgBegin = await call('/internal/tesi/begin', 'POST', pkgTurn, 201, bridge);
  const pkgId = `paquete-${pkg.idServicio}`;
  const pkgResult = { state: { service: pkgId, packageVersion: pkg.version }, reply: 'Paquete disponible.', interpretacionR7: { campos: { servicio: { valor: pkgId, evidencias: [{ idMensaje: String(pkgBegin.evidencias.at(-1).idMensaje), fragmento: pkgTurn.mensaje }] } }, senales: {} } };
  const pkgSaved = await call('/internal/tesi/finish', 'POST', { ...pkgTurn, respuesta: pkgResult.reply, resultadoJson: JSON.stringify(pkgResult) }, 201, bridge);
  assert.equal(pkgSaved.resultado.calificacion.servicio, pkgId);
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
    const listener = createServer();
    await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    process.env.APP_ORIGIN = origin;
    const nodeArgs = process.env.R7_UI === '1' ? ['--import', new URL('./r7-ai-mock.mjs', import.meta.url).href] : [];
    frontend = spawn(process.execPath, [...nodeArgs, process.env.R6_UI_ENTRY || 'dist/server/entry.mjs'], {
      cwd: landing,
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(port),
        API_PROXY_TARGET: base,
        CRM_API_URL: base,
        NODE_ENV: 'production',
        ...(process.env.R7_UI === '1' ? { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-only', GEMINI_MODEL: 'test-model', OPENAI_API_KEY: '' } : {}),
      },
    });
    let ready = false;
    for (let n = 0; n < 60; n++) {
      try {
        if ((await fetch(origin)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert(ready, 'No arrancó el servidor Astro compilado.');
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
    'OK R6: migraciones, perfil opcional, persistencia, revisiones, identidades concurrentes, conversion, Tesi, sugerencias, auditoria, permisos y reservas.',
  );
} finally {
  if (browser) await browser.close();
  if (frontend) frontend.kill();
  if (app) await app.close();
  if (db?.isInitialized) await db.destroy();
  if (control.isInitialized) {
    await control.query(`DROP SCHEMA ${schema} CASCADE`);
    await control.destroy();
  }
}
