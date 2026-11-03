// PostgreSQL and HTTP integration. All business writes stay in an isolated random schema.
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer, request as proxyRequest } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { entities } from '../dist/entities/index.js';
import { AdminModule } from '../dist/modules/admin/admin.module.js';
import { passwordHash } from '../dist/modules/admin/auth.js';
import {
  ReferralsService,
  referralDigest,
} from '../dist/modules/admin/referrals.service.js';
import { InitialSchema1791855075011 } from '../dist/migrations/1791855075011-InitialSchema.js';
import { AdminPanel1791900000000 } from '../dist/migrations/1791900000000-AdminPanel.js';
import { ContractServices1792060000000 } from '../dist/migrations/1792060000000-ContractServices.js';
import { ResourceLibrary1792200000000 } from '../dist/migrations/1792200000000-ResourceLibrary.js';
import { BuyerProfiles1792300000000 } from '../dist/migrations/1792300000000-BuyerProfiles.js';
import { BuyerAcademicCatalogs1792310000000 } from '../dist/migrations/1792310000000-BuyerAcademicCatalogs.js';
import { ResourceJourneys1792400000000 } from '../dist/migrations/1792400000000-ResourceJourneys.js';
import { Referrals1792500000000 } from '../dist/migrations/1792500000000-Referrals.js';
import { LeadProfiling1792500000000 } from '../dist/migrations/1792500000000-LeadProfiling.js';
import { TesiQualification1792600000000 } from '../dist/migrations/1792600000000-TesiQualification.js';
import { EnlaceReferidoModule } from '../dist/modules/leads/enlace-referido/enlace-referido.module.js';

const schema = `r4_test_${randomBytes(8).toString('hex')}`;
const connection = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
};
const control = new DataSource(connection);
let db,
  app,
  server,
  browser,
  passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log('OK ' + name);
}
try {
  await control.initialize();
  // Never search public or operate on an existing schema. Also refuse an explicitly production environment.
  assert.notEqual(
    process.env.NODE_ENV,
    'production',
    'Use a non-production test environment.',
  );
  assert.match(schema, /^r4_test_[a-f0-9]{16}$/);
  await control.query(`CREATE SCHEMA ${schema}`);
  const options = {
    ...connection,
    schema,
    entities,
    synchronize: false,
    extra: { options: `-c search_path=${schema}` },
    migrations: [
      InitialSchema1791855075011,
      AdminPanel1791900000000,
      ContractServices1792060000000,
      ResourceLibrary1792200000000,
      BuyerProfiles1792300000000,
      BuyerAcademicCatalogs1792310000000,
      ResourceJourneys1792400000000,
      LeadProfiling1792500000000,
      TesiQualification1792600000000,
      Referrals1792500000000,
    ],
  };
  db = new DataSource({
    ...options,
    migrations: options.migrations.slice(0, -1),
  });
  await db.initialize();
  await db.runMigrations();
  await check(
    'Migración con códigos históricos duplicados por referente conserva filas y deshabilita códigos inseguros',
    async () => {
      const [priorLead] = await db.query(
        `INSERT INTO lead(nombres,correo,telefono,id_estado) SELECT 'Cliente Histórico','historico@example.test','999000099',id_estado FROM estado_lead WHERE codigo='nuevo' RETURNING id_lead`,
      );
      await db.query('INSERT INTO cliente(id_lead) VALUES($1)', [
        priorLead.id_lead,
      ]);
      await db.query(
        `INSERT INTO enlace_referido(id_lead_referente,codigo) VALUES($1,'LEGADO_1'),($1,'LEGADO_2')`,
        [priorLead.id_lead],
      );
      await db.destroy();
      db = new DataSource(options);
      await db.initialize();
      await db.runMigrations();
      const rows = await db.query(
        `SELECT codigo,id_cliente,activo FROM enlace_referido WHERE id_lead_referente=$1 ORDER BY id_referido`,
        [priorLead.id_lead],
      );
      assert.equal(rows.length, 2);
      assert.equal(rows[0].codigo, 'LEGADO_1');
      assert.ok(rows[0].id_cliente);
      assert.equal(rows[1].id_cliente, null);
      assert.ok(rows.every((r) => r.activo === false));
    },
  );
  const [{ current_schema: currentSchema }] = await db.query(
    'SELECT current_schema()',
  );
  assert.equal(currentSchema, schema);
  const password = randomBytes(18).toString('hex');
  await db.query(
    `INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('Admin','R4','r4-admin@example.test','administrador',$1)`,
    [await passwordHash(password)],
  );
  class Root {}
  Module({
    imports: [
      TypeOrmModule.forRoot(options),
      AdminModule,
      EnlaceReferidoModule,
    ],
  })(Root);
  app = await NestFactory.create(Root, { logger: false });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  let origin = 'http://localhost:4321',
    adminCookie = '';
  process.env.APP_ORIGIN = origin;
  async function http(path, method = 'GET', body, extra = {}) {
    return fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        ...(path.startsWith('/admin') ? { Cookie: adminCookie } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async function expect(path, method = 'GET', body, status = 200, extra = {}) {
    const res = await http(path, method, body, extra),
      data = await res.json();
    assert.equal(res.status, status, `${path}: ${JSON.stringify(data)}`);
    return data;
  }
  await check('Guard administrativo y control de origen', async () => {
    await expect('/admin/referidos', 'GET', undefined, 401);
    await expect('/admin/referidos', 'POST', { idCliente: 1 }, 401);
    const login = await http('/auth/login', 'POST', {
      correo: 'r4-admin@example.test',
      password,
    });
    assert.equal(login.status, 200);
    adminCookie = login.headers.get('set-cookie').split(';')[0];
    await expect('/enlace-referido', 'POST', {}, 403, { Cookie: adminCookie });
    await expect('/admin/referidos', 'POST', { idCliente: 1 }, 403, {
      Origin: 'https://other.test',
    });
    await expect(
      '/public/referidos/contexto',
      'POST',
      { codigo: '12345678' },
      403,
      { Origin: 'https://other.test' },
    );
    await expect(
      '/public/referidos/contexto',
      'POST',
      { codigo: "' OR 1=1 --" },
      400,
    );
  });
  const [{ id_estado: state }] = await db.query(
    `SELECT id_estado FROM estado_lead WHERE codigo='nuevo'`,
  );
  async function fixtureClient(name, phone, email) {
    const [lead] = await db.query(
      `INSERT INTO lead(nombres,telefono,correo,id_estado) VALUES($1,$2,$3,$4) RETURNING id_lead`,
      [name, phone, email, state],
    );
    const [client] = await db.query(
      `INSERT INTO cliente(id_lead) VALUES($1) RETURNING id_cliente`,
      [lead.id_lead],
    );
    return { ...client, ...lead };
  }
  const client = await fixtureClient(
    'Cliente Referente',
    '999000001',
    'referente@example.test',
  );
  const second = await fixtureClient(
    'Otro Referente',
    '999000002',
    'otro@example.test',
  );
  await db.query(
    `INSERT INTO enlace_referido(id_lead_referente,id_cliente,codigo) VALUES($1,$2,'historico_R4')`,
    [client.id_lead, client.id_cliente],
  );
  let code, secondCode;
  await check(
    'Generación concurrente idempotente, código único y cliente válido',
    async () => {
      const rows = await Promise.all(
        Array.from({ length: 6 }, () =>
          expect(
            '/admin/referidos',
            'POST',
            { idCliente: client.id_cliente },
            201,
          ),
        ),
      );
      code = rows[0];
      assert.equal(new Set(rows.map((r) => r.codigo)).size, 1);
      assert.match(code.codigo, /^[a-f0-9]{30}$/);
      secondCode = await expect(
        '/admin/referidos',
        'POST',
        { idCliente: second.id_cliente },
        201,
      );
      assert.notEqual(code.codigo, secondCode.codigo);
      const [historical] = await db.query(
        "SELECT codigo,activo FROM enlace_referido WHERE codigo='historico_R4'",
      );
      assert.equal(historical.codigo, 'historico_R4');
      assert.equal(historical.activo, false);
      await expect('/admin/referidos', 'POST', { idCliente: 2147483647 }, 400);
      await expect(
        '/admin/referidos',
        'POST',
        { idCliente: client.id_cliente, activo: true },
        400,
      );
    },
  );
  async function context(codigo, previous = '') {
    const res = await http(
      '/public/referidos/contexto',
      'POST',
      { codigo },
      { Cookie: previous },
    );
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { ok: true });
    return res.headers.get('set-cookie');
  }
  const rawCookie = await context(code.codigo);
  assert.ok(rawCookie.includes('HttpOnly'));
  const refCookie = rawCookie.split(';')[0];
  await check(
    'Primera referencia, contexto servidor y ausencia de captación por visita',
    async () => {
      assert.equal(await context(secondCode.codigo, refCookie), null);
      assert.equal(await context('codigo_inexistente'), null);
      const summary = await expect('/admin/referidos/resumen');
      assert.equal(summary.captados, 0);
      const [stored] = await db.query(
        'SELECT * FROM contexto_referido WHERE token_hash=$1',
        [referralDigest(refCookie.split('=')[1])],
      );
      assert.ok(stored);
      assert.equal(stored.id_referido, code.idReferido);
    },
  );
  const capture = (phone, email = 'nuevo@example.test') => ({
    nombres: 'Contacto R4',
    telefono: phone,
    correo: email,
    canalOrigen: 'directo',
    recursoInteres: 'Guía R4',
    consentimiento: true,
  });
  let captured;
  await check(
    'Captación concurrente real, persistencia y duplicados por correo/teléfono',
    async () => {
      await Promise.all(
        Array.from({ length: 5 }, () =>
          expect('/captacion/buyers', 'POST', capture('999000010'), 201, {
            Cookie: refCookie,
          }),
        ),
      );
      const [count] = await db.query(
        'SELECT count(*)::int AS total FROM atribucion_referido',
      );
      assert.equal(count.total, 1);
      const rows = await expect(
        `/admin/referidos/${code.idReferido}/historial`,
      );
      captured = rows.items[0];
      assert.equal(captured.comercial, 'buyer');
      await expect(
        '/captacion/buyers',
        'POST',
        capture('+51 999000010', 'different@example.test'),
        201,
        { Cookie: refCookie },
      );
      const [buyers] = await db.query(
        'SELECT count(*)::int AS total FROM buyer',
      );
      assert.equal(buyers.total, 1);
      assert.equal(
        (await expect(`/admin/referidos/origen/buyer/${captured.idBuyer}`))
          .codigo,
        code.codigo,
      );
    },
  );
  await check(
    'No autorreferidos, no atribución retroactiva y consentimiento requerido',
    async () => {
      await expect(
        '/captacion/buyers',
        'POST',
        capture('999000001', 'self@example.test'),
        201,
        { Cookie: refCookie },
      );
      await expect(
        '/captacion/buyers',
        'POST',
        { ...capture('999000011'), consentimiento: false },
        400,
        { Cookie: refCookie },
      );
      await expect(
        '/captacion/buyers',
        'POST',
        capture('999000012', 'prior@example.test'),
        201,
      );
      await expect(
        '/captacion/buyers',
        'POST',
        capture('999000012', 'prior@example.test'),
        201,
        { Cookie: refCookie },
      );
      assert.equal((await expect('/admin/referidos/resumen')).captados, 1);
    },
  );
  let resourceId, resourceToken, resourceBuyer;
  await check(
    'Recursos existentes, campañas /r y atribución por cookie HttpOnly',
    async () => {
      const [resource] = await db.query(
        `INSERT INTO recurso_gratuito(titulo,archivo_url,activo,publicado,destacado) VALUES('Guía referidos R4','https://example.test/guia.pdf',true,true,true) RETURNING id_recurso`,
      );
      resourceId = resource.id_recurso;
      const link = await expect(
        `/admin/recursos/${resourceId}/enlaces`,
        'POST',
        { canal: 'facebook', medio: 'social', campana: 'R4' },
        201,
      );
      const redirect = await fetch(base + '/r/' + link.codigo, {
        redirect: 'manual',
      });
      assert.equal(redirect.status, 302);
      resourceToken = (
        await expect(
          `/public/recursos/${resourceId}/visitas`,
          'POST',
          { enlace: link.codigo },
          201,
        )
      ).token;
      await expect(
        '/public/recursos/contacto',
        'POST',
        {
          nombres: 'Recurso Referido',
          telefono: '999000020',
          consentimiento: true,
        },
        201,
        { 'X-Resource-Access': resourceToken, Cookie: refCookie },
      );
      const rows = await expect(
        `/admin/referidos/${code.idReferido}/historial`,
      );
      resourceBuyer = rows.items.find((r) => r.nombres === 'Recurso Referido');
      assert.ok(resourceBuyer);
      const [resourceProfile] = await db.query('SELECT canal_origen,procedencia_campos FROM buyer WHERE id_buyer=$1', [resourceBuyer.idBuyer]);
      assert.equal(resourceProfile.canal_origen, 'facebook');
      assert.equal(resourceProfile.procedencia_campos.nombres.origen, 'recursos');
      assert.equal(resourceProfile.procedencia_campos.nombres.confirmado, true);
      assert.equal(resourceProfile.procedencia_campos.telefono.confirmado, true);
      await expect(
        '/public/recursos/contacto',
        'POST',
        {
          nombres: 'Recurso Referido',
          telefono: '999000020',
          consentimiento: true,
        },
        201,
        { 'X-Resource-Access': resourceToken, Cookie: refCookie },
      );
      assert.equal((await expect('/admin/referidos/resumen')).captados, 2);
      const [session] = await db.query(
        'SELECT s.id_referido,s.utm_source FROM sesion_landing s JOIN solicitud_recurso r USING(id_sesion) WHERE r.id_buyer=$1',
        [resourceBuyer.idBuyer],
      );
      assert.equal(session.id_referido, code.idReferido);
      assert.equal(session.utm_source, 'facebook');
    },
  );
  let leadId;
  await check('Conversión por agenda conserva atribución y CRM', async () => {
    await expect('/public/recursos/agendar', 'POST', undefined, 201, {
      'X-Resource-Access': resourceToken,
    });
    const a = await expect(
      `/admin/referidos/origen/buyer/${resourceBuyer.idBuyer}`,
    );
    leadId = a.idLead;
    assert.ok(leadId);
    const [convertedProfile] = await db.query('SELECT procedencia_campos FROM lead WHERE id_lead=$1', [leadId]);
    assert.equal(convertedProfile.procedencia_campos.nombres.origen, 'recursos');
    assert.equal(convertedProfile.procedencia_campos.telefono.confirmado, true);
    assert.equal(a.comercial, 'lead');
    assert.ok(a.fechaLead);
    assert.equal(
      (await expect(`/admin/referidos/origen/lead/${leadId}`)).codigo,
      code.codigo,
    );
    assert.equal((await expect('/admin/referidos/resumen')).leads, 1);
  });
  await check(
    'Contrato y pago confirmado reales: conversión reflejada sin tocar triggers financieros',
    async () => {
      const catalog = await expect('/admin/contratos/catalogos');
      const contract = await expect(
        '/admin/contratos',
        'POST',
        {
          idLead: leadId,
          propuesta: {
            moneda: 'PEN',
            modalidad: 'virtual',
            detalles: [
              {
                idServicio: catalog.servicios[0].idServicio,
                cantidad: 1,
                precioUnitario: '100.00',
                descuento: '0.00',
              },
            ],
          },
          fechaFirma: new Date().toISOString(),
          versionClausulas: 'R4-test',
          aceptaAutoriaEstudiante: true,
        },
        201,
      );
      let a = await expect(`/admin/referidos/origen/lead/${leadId}`);
      assert.equal(a.contratado, true);
      assert.equal(a.pagoConfirmado, false);
      assert.equal(a.comercial, 'contrato');
      // Only the pending fixture is inserted directly; confirmation uses the existing CRM API.
      const [payment] = await db.query(
        `INSERT INTO pago(id_contrato,id_lead,monto,estado,fecha_pago,metodo) VALUES($1,$2,10,'pendiente',now(),'transferencia') RETURNING id_pago`,
        [contract.idContrato, leadId],
      );
      assert.equal((await expect('/admin/referidos/resumen')).clientes, 0);
      await expect(`/admin/pagos-previos/${payment.id_pago}`, 'PATCH', {
        estado: 'confirmado',
        fechaPago: new Date().toISOString(),
      });
      a = await expect(`/admin/referidos/origen/lead/${leadId}`);
      assert.equal(a.comercial, 'cliente');
      assert.equal(a.pagoConfirmado, true);
      assert.ok(a.fechaCliente);
      assert.equal((await expect('/admin/referidos/resumen')).clientes, 1);
    },
  );
  await check(
    'Conversión administrativa buyer → lead conserva atribución',
    async () => {
      const b = await expect('/admin/buyers/' + captured.idBuyer);
      await expect('/admin/buyers/' + captured.idBuyer, 'PATCH', {
        revision: b.revision,
        nombres: b.nombres,
        telefono: b.telefono,
        correo: b.correo,
        canalOrigen: b.canalOrigen,
        fechaRegistro: b.fechaRegistro,
        motivoCaptacion: b.motivoCaptacion,
        estado: 'lead',
        idEstadoLead: state,
        motivoConversion: 'Prueba R4',
      });
      assert.equal(
        (await expect(`/admin/referidos/origen/buyer/${captured.idBuyer}`))
          .comercial,
        'lead',
      );
    },
  );
  await check(
    'Desactivación, expiración, primera atribución e historial conservado',
    async () => {
      await expect(`/admin/referidos/${code.idReferido}/estado`, 'PATCH', {
        activo: false,
      });
      assert.equal(await context(code.codigo), null);
      await expect(
        '/captacion/buyers',
        'POST',
        capture('999000030', 'disabled@example.test'),
        201,
        { Cookie: refCookie },
      );
      assert.equal((await expect('/admin/referidos/resumen')).captados, 2);
      await expect(`/admin/referidos/${code.idReferido}/estado`, 'PATCH', {
        activo: true,
      });
      await db.query(
        "UPDATE contexto_referido SET expira_at=now()-interval '1 second'",
      );
      await expect(
        '/captacion/buyers',
        'POST',
        capture('999000031', 'expired@example.test'),
        201,
        { Cookie: refCookie },
      );
      assert.equal((await expect('/admin/referidos/resumen')).captados, 2);
      assert.equal(
        (await expect('/admin/referidos?comercial=cliente')).items[0].codigo,
        code.codigo,
      );
      await expect(
        '/admin/referidos?desde=2026-11-03&hasta=2026-11-01',
        'GET',
        undefined,
        400,
      );
      await expect(`/admin/referidos/${code.idReferido}/estado`, 'PATCH', {
        activo: false,
      });
    },
  );
  await check('Límite de abuso público', async () => {
    let limited = false;
    for (let i = 0; i < 32; i++) {
      const res = await http('/public/referidos/contexto', 'POST', {
        codigo: 'inexistente',
      });
      if (res.status === 429) limited = true;
    }
    assert.ok(limited);
  });

  if (process.argv.includes('--browser')) {
    const requireFrontend = createRequire(
      new URL('../../tesispro_frontend/package.json', import.meta.url),
    );
    const { chromium, expect: ui } = requireFrontend('@playwright/test');
    const frontend = process.env.R4_FRONTEND_ORIGIN || 'http://localhost:4321';
    server = createServer((req, res) => {
      const api =
        req.url.startsWith('/api/') &&
        !/^\/api\/(faq-ai|negotiation)(\/|\?|$)/.test(req.url);
      const target = new URL(
        api ? req.url.replace(/^\/api/, '') : req.url,
        api || req.url.startsWith('/r/') ? base : frontend,
      );
      const proxy = proxyRequest(
        target,
        { method: req.method, headers: { ...req.headers, host: target.host } },
        (upstream) => {
          res.writeHead(upstream.statusCode || 502, upstream.headers);
          upstream.pipe(res);
        },
      );
      proxy.on('error', () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(proxy);
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    origin = `http://127.0.0.1:${server.address().port}`;
    process.env.APP_ORIGIN = origin;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const output = resolve('.artifacts/r4');
    await mkdir(output, { recursive: true });
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await ctx.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const login = await http('/auth/login', 'POST', {
      correo: 'r4-admin@example.test',
      password,
    });
    await ctx.addCookies([
      {
        name: 'tesispro_session',
        value: login.headers.get('set-cookie').split(';')[0].split('=')[1],
        url: origin,
      },
    ]);
    await check(
      'Navegador: módulo nativo, habilitar cliente, filtros, historial y copia',
      async () => {
        await page.goto(origin + '/admin/buyers');
        await ui(
          page.getByRole('heading', { name: 'Buyers', exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: resolve(output, 'buyers-comparacion.png'),
          fullPage: true,
        });
        await page.goto(origin + '/admin/referidos');
        await ui(
          page.getByRole('heading', { name: 'Referidos', exact: true }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Habilitar cliente', exact: true })
          .click();
        const modal = page.getByRole('dialog');
        await modal
          .getByLabel('Cliente', { exact: true })
          .selectOption(String(client.id_cliente));
        await modal
          .getByRole('button', { name: 'Generar o habilitar código' })
          .click();
        await ui(modal).toHaveCount(0);
        await page.getByLabel('Cliente o código').fill(code.codigo);
        await ui(
          page.getByText(secondCode.codigo, { exact: true }),
        ).toHaveCount(0);
        await page
          .getByRole('button', {
            name: 'Copiar enlace ' + code.codigo,
            exact: true,
          })
          .click();
        await ui(
          page
            .getByRole('status')
            .filter({ hasText: 'Enlace de referido copiado.' }),
        ).toBeVisible();
        await page
          .getByRole('button', {
            name: 'Ver referidos ' + code.codigo,
            exact: true,
          })
          .click();
        await ui(
          page
            .getByRole('dialog')
            .getByRole('cell', { name: /^Recurso Referido/ }),
        ).toBeVisible();
        await page.screenshot({
          path: resolve(output, 'referidos-historial.png'),
          fullPage: true,
        });
        await page.keyboard.press('Escape');
        await page.screenshot({
          path: resolve(output, 'referidos-escritorio.png'),
          fullPage: true,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        );
        await ui(
          page.getByRole('heading', { name: 'Referidos', exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: resolve(output, 'referidos-movil.png'),
          fullPage: true,
        });
      },
    );
    await check(
      'Navegador E2E: enlace → navegación → formulario real → PostgreSQL → CRM',
      async () => {
        // Fresh visitor/IP limiter, no administrative session; campaign and referral tokens are independent.
        const service = app.get(ReferralsService);
        service.attempts.clear();
        const visitor = await browser.newContext({
          viewport: { width: 1280, height: 900 },
        });
        const landing = await visitor.newPage();
        landing.on('pageerror', (e) => errors.push(e.message));
        landing.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        const initialized = landing.waitForResponse(
          (r) =>
            r.url().includes('/api/public/referidos/contexto') &&
            r.status() === 201,
        );
        await landing.goto(`${origin}/?ref=${code.codigo}`);
        await initialized;
        const cookies = await visitor.cookies();
        assert.ok(cookies.find((c) => c.name === 'tesispro_ref' && c.httpOnly));
        await landing.goto(origin + '/faq');
        await landing.goto(origin + '/');
        // Use the resource card's existing access action. UI labels are inspected by the locator below.
        const card = landing
          .locator('article')
          .filter({ hasText: 'Guía referidos R4' });
        await card.getByRole('button').first().click();
        await landing
          .getByLabel('Nombre', { exact: true })
          .fill('Navegador R4');
        await landing.getByLabel('Teléfono', { exact: true }).fill('999000040');
        await landing.getByRole('checkbox').check();
        await landing
          .getByRole('button', { name: 'Acceder al recurso', exact: true })
          .last()
          .click();
        await ui(
          landing.getByRole('button', { name: /Agendar/ }),
        ).toBeVisible();
        const [persisted] = await db.query(
          `SELECT a.id_buyer FROM atribucion_referido a JOIN buyer b USING(id_buyer) WHERE b.nombres='Navegador R4'`,
        );
        assert.ok(persisted);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(origin + '/admin/referidos');
        await page
          .getByRole('button', {
            name: 'Ver referidos ' + code.codigo,
            exact: true,
          })
          .click();
        await ui(
          page.getByRole('dialog').getByRole('cell', { name: /^Navegador R4/ }),
        ).toBeVisible();
        await page.goto(origin + '/admin/buyers');
        await page
          .getByRole('button', { name: 'Ver Navegador R4', exact: true })
          .click();
        await ui(
          page
            .getByRole('dialog')
            .getByRole('heading', { name: 'Origen: Referido', exact: true }),
        ).toBeVisible();
        await ui(
          page
            .getByRole('dialog')
            .getByText('Referido por: Cliente Referente', { exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: resolve(output, 'buyer-origen.png'),
          fullPage: true,
        });
        await page.goto(origin + '/admin/leads');
        await page
          .getByRole('button', { name: 'Ver Recurso Referido', exact: true })
          .click();
        await ui(
          page
            .getByRole('dialog')
            .getByRole('heading', { name: 'Origen: Referido', exact: true }),
        ).toBeVisible();
        await ui(
          page
            .getByRole('dialog')
            .getByText('Código: ' + code.codigo, { exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: resolve(output, 'lead-origen.png'),
          fullPage: true,
        });
        await landing.screenshot({
          path: resolve(output, 'landing-oscuro.png'),
          fullPage: true,
        });
        await landing.evaluate(() => {
          localStorage.setItem('tesispro-theme', 'light');
          document.documentElement.setAttribute('data-theme', 'light');
        });
        await landing.setViewportSize({ width: 390, height: 844 });
        await landing.screenshot({
          path: resolve(output, 'landing-claro-movil.png'),
          fullPage: true,
        });
        await visitor.close();
        assert.deepEqual(errors, []);
        await writeFile(
          resolve(output, 'consola.json'),
          JSON.stringify({ pageErrors: errors, consoleErrors }, null, 2),
        );
        console.log(
          `Consola navegador: ${errors.length} excepciones JavaScript; ${consoleErrors.length} mensajes console.error (ver .artifacts/r4/consola.json).`,
        );
      },
    );
    await ctx.close();
  }
  console.log(
    `${passed} grupos R4 aprobados. Esquema aislado; sin cambios en tablas de aplicación existentes.`,
  );
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((done) => server.close(done));
  if (app) await app.close();
  if (db?.isInitialized) await db.destroy();
  if (control.isInitialized) {
    assert.match(schema, /^r4_test_[a-f0-9]{16}$/);
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.destroy();
  }
}
