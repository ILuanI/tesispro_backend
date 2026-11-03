import { currentMigrations } from './test-migrations.mjs';
import { TesiQualification1792600000000 } from '../dist/migrations/1792600000000-TesiQualification.js';
import { LeadProfiling1792500000000 } from '../dist/migrations/1792500000000-LeadProfiling.js';
import { ResourceJourneys1792400000000 } from '../dist/migrations/1792400000000-ResourceJourneys.js';
import { ResourceLibrary1792200000000 } from '../dist/migrations/1792200000000-ResourceLibrary.js';
// Pruebas con HTTP y PostgreSQL reales, aisladas en un esquema temporal.
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer, request as proxyRequest } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { entities } from '../dist/entities/index.js';
import { AdminModule } from '../dist/modules/admin/admin.module.js';
import { passwordHash } from '../dist/modules/admin/auth.js';
import { InitialSchema1791855075011 } from '../dist/migrations/1791855075011-InitialSchema.js';
import { AdminPanel1791900000000 } from '../dist/migrations/1791900000000-AdminPanel.js';
import { BuyerProfiles1792300000000 } from '../dist/migrations/1792300000000-BuyerProfiles.js';
import { BuyerAcademicCatalogs1792310000000 } from '../dist/migrations/1792310000000-BuyerAcademicCatalogs.js';

const schema = `buyers_test_${randomBytes(8).toString('hex')}`;
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
async function check(label, fn) {
  await fn();
  console.log(`OK ${label}`);
  passed++;
}
try {
  await control.initialize();
  await control.query(`CREATE SCHEMA ${schema}`);
  const options = {
    ...connection,
    schema,
    entities,
    extra: { options: `-c search_path=${schema}` },
    synchronize: false,
    migrations: currentMigrations,
  };
  db = new DataSource(options);
  await db.initialize();
  await db.runMigrations();
  const password = randomBytes(18).toString('hex');
  await db.query(
    "INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('Admin','Buyers','buyers-admin@example.test','administrador',$1)",
    [await passwordHash(password)],
  );
  const [{ id_universidad: university }] = await db.query(
    "INSERT INTO universidad(nombre) VALUES('Universidad de prueba') RETURNING id_universidad",
  );
  const [{ id_grado: grade }] = await db.query(
    "INSERT INTO grado_academico(codigo,nombre) VALUES('prueba','Grado de prueba') RETURNING id_grado",
  );
  const [{ id_etapa: stage }] = await db.query(
    "INSERT INTO etapa_tesis(nombre,orden,id_grado) VALUES('Proyecto de prueba',1,$1) RETURNING id_etapa",
    [grade],
  );
  const [{ id_estado: newState }] = await db.query(
    "SELECT id_estado FROM estado_lead WHERE codigo='nuevo'",
  );
  class Root {}
  Module({ imports: [TypeOrmModule.forRoot(options), AdminModule] })(Root);
  app = await NestFactory.create(Root, { logger: false });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  let origin = 'http://localhost:4321',
    cookie = '';
  process.env.APP_ORIGIN = origin;
  async function http(path, method = 'GET', body, extra = {}) {
    if(method==='PATCH' && /^\/admin\/buyers\/\d+$/.test(path) && body && body.revision===undefined) {const [current]=await db.query('SELECT revision FROM buyer WHERE id_buyer=$1',[path.split('/').at(-1)]);if(current)body={...body,revision:current.revision};}
    return fetch(`${base}${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async function expect(path, method = 'GET', body, status = 200) {
    const res = await http(path, method, body),
      data = await res.json();
    assert.equal(res.status, status, `${path}: ${JSON.stringify(data)}`);
    return data;
  }
  const root = '/admin/buyers';
  const dto = {
    nombres: 'María',
    apellidos: 'Pérez',
    correo: 'maria@example.test',
    telefono: '+51999111222',
    edadDeclarada: 27,
    departamento: 'Lima',
    idUniversidad: university,
    idGrado: grade,
    idEtapa: stage,
    condicion: 'egresado',
    canalOrigen: 'instagram',
    fechaRegistro: '2025-10-01T10:30:00-05:00',
    motivoCaptacion: 'descarga_recurso',
    recursoInteres: 'Matriz de consistencia',
    notas: 'Interés académico inicial',
    estado: 'buyer',
  };
  const capture = {
    nombres: 'Visitante',
    correo: 'visitante@example.test',
    telefono: '+51999111333',
    canalOrigen: 'facebook',
    recursoInteres: 'Guía de investigación',
    consentimiento: true,
  };
  let first;
  await check(
    'CRUD protegido y captación pública sin exponer perfiles',
    async () => {
      for (const [path, method] of [
        [root, 'GET'],
        [root, 'POST'],
        [`${root}/1`, 'GET'],
        [`${root}/1`, 'PATCH'],
        [`${root}/1`, 'DELETE'],
        [`${root}/origen-lead/1`, 'GET'],
      ])
        await expect(path, method, undefined, 401);
      assert.deepEqual(
        await expect('/captacion/buyers', 'POST', capture, 201),
        { ok: true },
      );
      await expect(
        '/captacion/buyers',
        'POST',
        { ...capture, consentimiento: false },
        400,
      );
      await expect(
        '/captacion/buyers',
        'POST',
        { ...capture, estado: 'lead' },
        400,
      );
      assert.equal(
        (
          await http('/captacion/buyers', 'POST', capture, {
            Origin: 'https://other.test',
          })
        ).status,
        403,
      );
      const login = await http('/auth/login', 'POST', {
        correo: 'buyers-admin@example.test',
        password,
      });
      assert.equal(login.status, 200);
      cookie = login.headers.get('set-cookie').split(';')[0];
      assert.equal(
        (await http(root, 'POST', dto, { Origin: 'https://other.test' }))
          .status,
        403,
      );
    },
  );
  await check(
    'Crear y consultar todos los datos del perfil sin aparecer en Leads',
    async () => {
      first = await expect(root, 'POST', dto, 201);
      assert.equal(first.universidadNombre, 'Universidad de prueba');
      assert.equal(first.edad, 27);
      assert.equal(first.etapaNombre, 'Proyecto de prueba');
      const detail = await expect(`${root}/${first.idBuyer}`);
      assert.equal(detail.estado, 'buyer');
      assert.equal(detail.recursoInteres, dto.recursoInteres);
      assert.equal((await expect('/admin/leads')).total, 0);
      assert.equal((await expect('/admin/resumen')).leads.total, 0);
      const catalogs = await expect(`${root}/catalogos`);
      assert.ok(catalogs.universidades.length);
      assert.ok(catalogs.etapas.length);
    },
  );
  await check(
    'Filtros combinados, edades, fechas, orden y paginación',
    async () => {
      const query = `q=María&canal=instagram&condicion=egresado&idUniversidad=${university}&idGrado=${grade}&idEtapa=${stage}&departamento=Lima&edadMin=25&edadMax=30&desde=2025-10-01&hasta=2025-10-01&motivoCaptacion=descarga_recurso`;
      assert.equal((await expect(`${root}?${query}`)).total, 1);
      assert.equal((await expect(`${root}?q=%25`)).total, 0);
      assert.equal(
        (await expect(`${root}?pageSize=1&page=2&sort=nombres&direction=asc`))
          .items.length,
        1,
      );
      assert.equal((await expect(`${root}?edadMax=26`)).total, 0);
      await expect(`${root}?edadMin=40&edadMax=20`, 'GET', undefined, 400);
      await expect(
        `${root}?desde=2025-12-31&hasta=2025-01-01`,
        'GET',
        undefined,
        400,
      );
    },
  );
  await check(
    'Edición, nacimiento y universidad fuera del catálogo',
    async () => {
      const updated = await expect(`${root}/${first.idBuyer}`, 'PATCH', {
        ...dto,
        fechaNacimiento: '2000-06-01',
        edadDeclarada: null,
        idUniversidad: null,
        universidadOtra: 'Universidad particular',
      });
      assert.equal(updated.fechaNacimiento, '2000-06-01');
      assert.equal(updated.edadDeclarada, null);
      assert.equal(updated.universidadNombre, 'Universidad particular');
      assert.ok(updated.edad >= 25);
      await expect(`${root}/${first.idBuyer}`, 'PATCH', dto);
    },
  );
  await check(
    'Validación, duplicados y prevención de altas paralelas en Leads',
    async () => {
      for (const patch of [
        { edadDeclarada: -1 },
        { correo: 'incorrecto' },
        { canalOrigen: 'inventado' },
        { fechaNacimiento: '2999-01-01' },
        { idUniversidad: 999999 },
        { idGrado: 32768 },
        { idEtapa: 999999 },
        { fechaRegistro: '2999-01-01T00:00:00Z' },
        { idUniversidad: university, universidadOtra: 'Otra' },
      ])
        await expect(
          root,
          'POST',
          { ...dto, correo: 'invalid@example.test', ...patch },
          400,
        );
      await expect(root, 'POST', { ...dto, correo: 'MARIA@EXAMPLE.TEST' }, 409);
      await expect(
        '/admin/leads',
        'POST',
        {
          nombres: 'Duplicado',
          correo: dto.correo,
          telefono: dto.telefono,
          idEstado: newState,
        },
        409,
      );
      await expect(`${root}/999999`, 'GET', undefined, 404);
      await expect(`${root}/99999999999999999999`, 'GET', undefined, 400);
    },
  );
  await check(
    'Captaciones repetidas no sobrescriben datos ni crean duplicados',
    async () => {
      await expect(
        '/captacion/buyers',
        'POST',
        { ...capture, nombres: 'Otro nombre', telefono: '999999999' },
        201,
      );
      assert.equal((await expect(`${root}?q=visitante@example.test`)).total, 1);
      assert.equal(
        (await expect(`${root}?q=visitante@example.test`)).items[0].nombres,
        'Visitante',
      );
    },
  );
  let converted;
  await check(
    'Conversión transaccional: desaparece de Buyers y conserva el perfil en Leads',
    async () => {
      await expect(
        `${root}/${first.idBuyer}`,
        'PATCH',
        { ...dto, estado: 'lead' },
        400,
      );
      assert.equal((await expect(`${root}/${first.idBuyer}`)).estado, 'buyer');
      converted = await expect(`${root}/${first.idBuyer}`, 'PATCH', {
        ...dto,
        estado: 'lead',
        idEstadoLead: newState,
        motivoConversion: 'Agendó una reunión',
      });
      assert.equal(converted.estado, 'lead');
      assert.ok(converted.idLead);
      assert.equal((await expect(`${root}?q=maria@example.test`)).total, 0);
      const lead = await expect(`/admin/leads/${converted.idLead}`);
      assert.equal(lead.correo, dto.correo);
      assert.equal(
        lead.perfilAcademico.universidadNombre,
        'Universidad de prueba',
      );
      assert.equal(lead.perfilAcademico.condicion, 'egresado');
      const original = await expect(`${root}/origen-lead/${converted.idLead}`);
      assert.equal(original.edad, 27);
      assert.equal(original.canalOrigen, 'instagram');
      assert.equal(original.etapaNombre, 'Proyecto de prueba');
      const history = await expect(
        `/admin/leads/${converted.idLead}/historial`,
      );
      assert.match(history[0].motivo, /Agendó una reunión/);
      assert.ok(history[0].usuarioNombre);
      assert.equal(
        (
          await db.query(
            'SELECT id_etapa FROM proyecto_tesis WHERE id_lead=$1',
            [converted.idLead],
          )
        )[0].id_etapa,
        stage,
      );
      assert.equal((await expect('/admin/leads')).total, 1);
      await expect(`${root}/${first.idBuyer}`, 'PATCH', dto, 409);
      await expect(`${root}/${first.idBuyer}`, 'DELETE', undefined, 409);
      await expect(root, 'POST', { ...dto, correo: dto.correo }, 409);
      await expect(
        '/captacion/buyers',
        'POST',
        { ...capture, correo: dto.correo },
        409,
      );
      assert.equal((await expect(`${root}?q=maria@example.test`)).total, 0);
    },
  );
  await check(
    'Conversión concurrente no duplica leads; eliminación de buyers pendientes',
    async () => {
      const row = await expect(
        root,
        'POST',
        { ...dto, correo: 'concurrent@example.test', telefono: '999555777' },
        201,
      );
      const results = await Promise.all([
        http(`${root}/${row.idBuyer}`, 'PATCH', {
          ...dto,
          correo: row.correo,
          telefono: row.telefono,
          estado: 'lead',
          idEstadoLead: newState,
          motivoConversion: 'Consultó precios',
        }),
        http(`${root}/${row.idBuyer}`, 'PATCH', {
          ...dto,
          correo: row.correo,
          telefono: row.telefono,
          estado: 'lead',
          idEstadoLead: newState,
          motivoConversion: 'Consultó precios',
        }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
      const remaining = (await expect(`${root}?q=visitante@example.test`))
        .items[0];
      await expect(`${root}/${remaining.idBuyer}`, 'DELETE');
      await expect(`${root}/${remaining.idBuyer}`, 'GET', undefined, 404);
    },
  );
  if (process.env.BUYERS_UI_TARGET) {
    const requireFrontend = createRequire(
        new URL('../../tesispro-landing/package.json', import.meta.url),
      ),
      { chromium, expect: uiExpect } = requireFrontend('@playwright/test');
    const backend = new URL(base),
      target = new URL(process.env.BUYERS_UI_TARGET);
    server = createServer((req, res) => {
      const isApi = req.url.startsWith('/api/'),
        upstream = isApi ? backend : target;
      const proxy = proxyRequest(
        {
          hostname: upstream.hostname,
          port: upstream.port,
          path: isApi ? req.url.slice(4) : req.url,
          method: req.method,
          headers: { ...req.headers, host: upstream.host },
        },
        (r) => {
          res.writeHead(r.statusCode, r.headers);
          r.pipe(res);
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
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.addCookies([
      { name: cookie.split('=')[0], value: cookie.split('=')[1], url: origin },
    ]);
    const output = resolve('../tesispro-landing/.artifacts/buyers');
    await mkdir(output, { recursive: true });
    await check(
      'Navegador: alta, edición, consulta, filtros y persistencia',
      async () => {
        await page.goto(`${origin}/admin/buyers`);
        await page
          .getByRole('button', { name: 'Nuevo buyer', exact: true })
          .click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Nombres', { exact: true }).fill('Lucía');
        await dialog
          .getByLabel('Correo electrónico', { exact: true })
          .fill('lucia@example.test');
        await dialog
          .getByLabel('Teléfono', { exact: true })
          .fill('999333444');
        await dialog.getByLabel('Edad declarada', { exact: true }).fill('29');
        await dialog.getByLabel('Departamento', { exact: true }).fill('Lima');
        await dialog
          .getByLabel('Universidad', { exact: true })
          .selectOption(String(university));
        await dialog
          .getByLabel('Grado académico', { exact: true })
          .selectOption(String(grade));
        await dialog
          .getByLabel('Etapa de tesis', { exact: true })
          .selectOption(String(stage));
        await dialog
          .getByLabel('Condición académica', { exact: true })
          .selectOption('egresado');
        await dialog
          .getByLabel('Canal de origen *', { exact: true })
          .selectOption('instagram');
        await dialog
          .getByRole('button', { name: 'Guardar buyer', exact: true })
          .click();
        await uiExpect(dialog).toHaveCount(0);
        await page.reload();
        await uiExpect(
          page.getByRole('button', { name: 'Lucía', exact: true }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Ver Lucía', exact: true })
          .click();
        await uiExpect(
          dialog.getByText('29 años', { exact: true }),
        ).toBeVisible();
        await dialog.press('Escape');
        await page
          .getByRole('button', { name: 'Editar Lucía', exact: true })
          .click();
        await dialog.getByLabel('Apellidos', { exact: true }).fill('Gómez');
        await dialog
          .getByRole('button', { name: 'Guardar buyer', exact: true })
          .click();
        await uiExpect(dialog).toHaveCount(0);
        await page
          .getByLabel('Buscar buyers', { exact: true })
          .fill('sin resultados');
        await uiExpect(
          page.getByText('No hay buyers para mostrar', { exact: true }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Limpiar filtros', exact: true })
          .first()
          .click();
        await uiExpect(
          page.getByRole('button', { name: 'Lucía Gómez', exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: resolve(output, 'escritorio.png'),
          fullPage: true,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: resolve(output, 'movil.png'),
          fullPage: true,
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
        await page.setViewportSize({ width: 1440, height: 1000 });
      },
    );
    await check(
      'Navegador: cambio de estado y ficha completa en Leads',
      async () => {
        await page
          .getByRole('button', { name: 'Editar Lucía', exact: true })
          .click();
        const dialog = page.getByRole('dialog');
        await dialog
          .getByLabel('Estado *', { exact: true })
          .selectOption('lead');
        await dialog
          .getByLabel('Motivo de conversión *', { exact: true })
          .fill('Solicitó precios por WhatsApp');
        await dialog
          .getByRole('button', { name: 'Guardar y pasar a Leads', exact: true })
          .click();
        await uiExpect(dialog).toHaveCount(0);
        await uiExpect(
          page.getByRole('button', { name: 'Lucía Gómez', exact: true }),
        ).toHaveCount(0);
        await page.getByRole('link', { name: 'Leads', exact: true }).click();
        await page
          .getByLabel('Buscar leads', { exact: true })
          .fill('lucia@example.test');
        await page
          .getByRole('button', { name: 'Lucía Gómez', exact: true })
          .click();
        await uiExpect(
          dialog.getByRole('heading', {
            name: 'Perfil buyer de origen',
            exact: true,
          }),
        ).toBeVisible();
        await uiExpect(
          dialog.getByText('29 años', { exact: true }),
        ).toBeVisible();
        await uiExpect(
          dialog.getByText('Proyecto de prueba', { exact: true }),
        ).toBeVisible();
        await dialog.press('Escape');
      },
    );
    // El recorrido publico completo se comprueba en test-journeys.mjs.
    assert.deepEqual(errors, []);
  }
  console.log(`${passed} grupos de pruebas de buyers completados.`);
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((done) => server.close(done));
  if (app) await app.close();
  if (db?.isInitialized) await db.destroy();
  if (control.isInitialized) {
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.destroy();
  }
}
