import { currentMigrations } from './test-migrations.mjs';
import { TesiQualification1792600000000 } from '../dist/migrations/1792600000000-TesiQualification.js';
import { LeadProfiling1792500000000 } from '../dist/migrations/1792500000000-LeadProfiling.js';
// API y navegador contra PostgreSQL real, siempre en un esquema temporal.
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
import { ResourceLibrary1792200000000 } from '../dist/migrations/1792200000000-ResourceLibrary.js';
import { BuyerProfiles1792300000000 } from '../dist/migrations/1792300000000-BuyerProfiles.js';
import { ResourceJourneys1792400000000 } from '../dist/migrations/1792400000000-ResourceJourneys.js';

const schema = `journey_test_${randomBytes(8).toString('hex')}`;
const connection = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
};
const control = new DataSource(connection);
let app,
  db,
  server,
  browser,
  passed = 0;
async function check(label, fn) {
  await fn();
  console.log('OK ' + label);
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
    "INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('Admin','Recursos','journey-admin@example.test','administrador',$1)",
    [await passwordHash(password)],
  );
  class Root {}
  Module({ imports: [TypeOrmModule.forRoot(options), AdminModule] })(Root);
  app = await NestFactory.create(Root, { logger: false });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  let origin = 'http://localhost:4321',
    cookie = '';
  process.env.APP_ORIGIN = origin;
  async function http(path, method = 'GET', body, token, extra = {}) {
    if(method==='PATCH' && /^\/admin\/buyers\/\d+$/.test(path) && body && body.revision===undefined) {const [current]=await db.query('SELECT revision FROM buyer WHERE id_buyer=$1',[path.split('/').at(-1)]);if(current)body={...body,revision:current.revision};}
    return fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        Origin: origin,
        Cookie:
          path.startsWith('/public/') || path.startsWith('/r/') ? '' : cookie,
        ...(body && !(body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...(token ? { 'X-Resource-Access': token } : {}),
        ...extra,
      },
      body: body
        ? body instanceof FormData
          ? body
          : JSON.stringify(body)
        : undefined,
    });
  }
  async function expect(path, method = 'GET', body, status = 200, token) {
    const res = await http(path, method, body, token),
      data = await res.json();
    assert.equal(res.status, status, `${path}: ${JSON.stringify(data)}`);
    return data;
  }
  const pub = '/public/recursos';
  const login = await http('/auth/login', 'POST', {
    correo: 'journey-admin@example.test',
    password,
  });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
  const fields = {
    titulo: 'Matriz de consistencia',
    descripcion: 'Recurso de prueba',
    categoria: 'metodologia_investigacion',
    formato: 'pdf',
    activo: 'true',
    publicado: 'false',
    destacado: 'false',
  };
  function resourceForm(updates = {}) {
    const f = new FormData();
    Object.entries({ ...fields, ...updates }).forEach(([k, v]) => f.set(k, v));
    f.set('archivo', new Blob(['%PDF-1.4\nDocumento de prueba']), 'matriz.pdf');
    return f;
  }
  const resource = await expect('/admin/recursos', 'POST', resourceForm(), 201),
    id = resource.idRecurso;
  let link;
  await check('Publicación explícita, destacados y validaciones', async () => {
    assert.deepEqual(await expect(pub), []);
    await expect(`${pub}/${id}`, 'GET', undefined, 404);
    await expect(
      `/admin/recursos/${id}`,
      'PATCH',
      resourceForm({ destacado: 'true' }),
      400,
    );
    await expect(
      `/admin/recursos/${id}`,
      'PATCH',
      resourceForm({ publicado: 'true', destacado: 'true' }),
    );
    assert.equal((await expect(pub))[0].idRecurso, id);
    const safe = await expect(`${pub}/${id}`);
    assert.equal(safe.archivoUrl, undefined);
    assert.equal(safe.archivoContenido, undefined);
    assert.equal(
      (await expect('/admin/recursos?publicado=true&destacado=true')).total,
      1,
    );
  });
  await check(
    'Enlaces por red conservan la campaña y evitan atribución adulterada',
    async () => {
      for (const canal of ['facebook', 'instagram', 'tiktok']) {
        const l = await expect(
          `/admin/recursos/${id}/enlaces`,
          'POST',
          {
            canal,
            medio: 'social',
            campana: 'tesis_2026',
            publicacion: `post_${canal}`,
          },
          201,
        );
        if (canal === 'facebook') link = l;
        const r = await http('/r/' + l.codigo);
        assert.equal(r.status, 302);
        const url = new URL(r.headers.get('location'));
        assert.equal(url.searchParams.get('utm_source'), canal);
        assert.equal(url.searchParams.get('recurso'), String(id));
        const { token } = await expect(
          `${pub}/${id}/visitas`,
          'POST',
          { enlace: l.codigo, canal: 'otro', campana: 'falsa' },
          201,
        );
        const [row] = await db.query(
          "SELECT canal,campana FROM solicitud_recurso WHERE token_hash=encode(sha256($1::bytea),'hex')",
          [Buffer.from(token)],
        );
        assert.equal(row.canal, canal);
        assert.equal(row.campana, 'tesis_2026');
      }
    },
  );
  const visit = async (attribution = {}) =>
    (await expect(`${pub}/${id}/visitas`, 'POST', attribution, 201)).token;
  const contact = async (token, phone = '999111001') => {
    await expect(
      `${pub}/contacto`,
      'POST',
      { nombres: 'Visitante de prueba', telefono: phone, consentimiento: true },
      201,
      token,
    );
    await expect(`${pub}/opciones`, 'POST', undefined, 201, token);
  };
  let downloadToken, meetingToken, slot, meeting;
  await check(
    'Captación con nombre y teléfono, abandono y separación de buyers/leads',
    async () => {
      downloadToken = await visit({ enlace: link.codigo });
      await contact(downloadToken);
      const buyers = await expect('/admin/buyers');
      assert.equal(buyers.total, 1);
      assert.equal(buyers.items[0].correo, null);
      assert.equal((await expect('/admin/leads')).total, 0);
      const history = await expect(
        '/admin/actividad?buyer=' + buyers.items[0].idBuyer,
      );
      assert.ok(
        history.items[0].eventos.some((e) => e.tipo === 'opciones_mostradas'),
      );
      assert.equal(
        (
          await expect(
            '/admin/buyers?descarga=sin_accion&recurso=' +
              id +
              '&campana=tesis_2026',
          )
        ).total,
        1,
      );
      await expect(`${pub}/descarga`, 'POST', undefined, 401, 'bad');
      const untouched = await visit();
      await expect(`${pub}/descarga`, 'POST', undefined, 400, untouched);
      await expect(
        `${pub}/contacto`,
        'POST',
        { nombres: 'X', telefono: '123', consentimiento: true },
        400,
        untouched,
      );
      assert.equal(
        (
          await http(
            `${pub}/contacto`,
            'POST',
            { nombres: 'X', telefono: '999111002', consentimiento: true },
            untouched,
            { Origin: 'https://bad.test' },
          )
        ).status,
        403,
      );
    },
  );
  await check(
    'Descarga interna registra solicitud y entrega sin convertir a lead',
    async () => {
      const res = await http(
        `${pub}/descarga`,
        'POST',
        undefined,
        downloadToken,
      );
      assert.equal(res.status, 201);
      assert.equal(await res.text(), '%PDF-1.4\nDocumento de prueba');
      for (let i = 0; i < 30; i++) {
        if ((await expect('/admin/actividad?descarga=entregada')).total) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal((await expect('/admin/buyers?descarga=entregada')).total, 1);
      assert.equal((await expect('/admin/leads')).total, 0);
    },
  );
  await check(
    'Clic en agendar convierte sin correo y conserva solicitudes sucesivas',
    async () => {
      meetingToken = await visit({
        canal: 'instagram',
        campana: 'otra_campana',
      });
      await contact(meetingToken, '999111002');
      const response = await expect(
        `${pub}/agendar`,
        'POST',
        undefined,
        201,
        meetingToken,
      );
      await expect(`${pub}/agendar`, 'POST', undefined, 201, meetingToken);
      assert.equal((await expect('/admin/buyers')).total, 1);
      const leads = await expect(
        '/admin/leads?reunion=pendiente&procedencia=instagram',
      );
      assert.equal(leads.total, 1);
      assert.equal(leads.items[0].correo, null);
      assert.equal(leads.items[0].reservaPendiente, true);
      for (
        let date = response.desde;
        date <= response.hasta;
        date = new Date(Date.parse(date + 'T12:00:00Z') + 86400000)
          .toISOString()
          .slice(0, 10)
      ) {
        const a = await expect(
          `${pub}/disponibilidad?fecha=${date}`,
          'GET',
          undefined,
          200,
          meetingToken,
        );
        if (a.horarios.length) {
          slot = a.horarios[0];
          break;
        }
      }
      assert.ok(slot);
      const second = await visit();
      await contact(second, '999111002');
      await expect(`${pub}/agendar`, 'POST', undefined, 201, second);
      assert.equal((await expect('/admin/leads')).total, 1);
      assert.equal(
        (await expect('/admin/actividad?lead=' + leads.items[0].idLead)).total,
        2,
      );
    },
  );
  const booking = (
    fechaInicio = slot,
    correo = 'visitante@example.test',
    telefono = '999111002',
  ) => ({
    nombres: 'Visitante de prueba',
    telefono,
    correo,
    universidad: 'Universidad de prueba',
    descripcion: 'Tema de investigación',
    fechaInicio,
  });
  await check(
    'Reserva real, datos completos, idempotencia y exclusión de horarios',
    async () => {
      await expect(
        `${pub}/reservas`,
        'POST',
        { ...booking(), correo: '' },
        400,
        meetingToken,
      );
      const date = slot.slice(0, 10);
      await expect(
        `${pub}/reservas`,
        'POST',
        booking(date + 'T09:15:00-05:00'),
        400,
        meetingToken,
      );
      meeting = await expect(
        `${pub}/reservas`,
        'POST',
        booking(),
        201,
        meetingToken,
      );
      const retry = await expect(
        `${pub}/reservas`,
        'POST',
        booking(),
        201,
        meetingToken,
      );
      assert.equal(meeting.idReunion, retry.idReunion);
      const availability = await expect(
        `${pub}/disponibilidad?fecha=${date}`,
        'GET',
        undefined,
        200,
        meetingToken,
      );
      assert.equal(availability.horarios.includes(slot), false);
      const leads = await expect('/admin/leads?reunion=confirmada');
      assert.equal(leads.total, 1);
      assert.equal(leads.items[0].reservaPendiente, false);
      assert.equal(leads.items[0].correo, 'visitante@example.test');
      assert.equal(
        (
          await expect(
            '/admin/reuniones?estado=confirmada&campana=otra_campana',
          )
        ).total,
        1,
      );
    },
  );
  await check(
    'Cancelación libera el cupo y queda registrada en el historial',
    async () => {
      await expect(
        `/admin/reuniones/${meeting.idReunion}/cancelar`,
        'POST',
        { motivo: 'Reprogramar' },
        201,
      );
      await expect(
        `/admin/reuniones/${meeting.idReunion}/cancelar`,
        'POST',
        { motivo: 'Reprogramar' },
        201,
      );
      const a = await expect(
        `${pub}/disponibilidad?fecha=${slot.slice(0, 10)}`,
        'GET',
        undefined,
        200,
        meetingToken,
      );
      assert.ok(a.horarios.includes(slot));
      assert.equal(
        (await expect('/admin/actividad?reunion=cancelada')).total,
        1,
      );
    },
  );
  await check(
    'Dos visitantes simultáneos: solo uno obtiene el cupo',
    async () => {
      const t = await visit();
      await contact(t, '999111003');
      await expect(`${pub}/agendar`, 'POST', undefined, 201, t);
      const result = await Promise.all([
        http(`${pub}/reservas`, 'POST', booking(), meetingToken),
        http(
          `${pub}/reservas`,
          'POST',
          booking(slot, 'segundo@example.test', '999111003'),
          t,
        ),
      ]);
      assert.deepEqual(result.map((r) => r.status).sort(), [201, 409]);
      assert.equal(
        (await expect('/admin/reuniones?estado=confirmada')).total,
        1,
      );
    },
  );
  await check(
    'Enlaces externos no se confunden con archivos entregados',
    async () => {
      const external = await expect(
        '/admin/recursos',
        'POST',
        {
          ...fields,
          activo: true,
          publicado: true,
          destacado: false,
          titulo: 'Video externo',
          formato: 'video',
          archivoUrl: 'https://example.test/video',
        },
        201,
      );
      const token = (
        await expect(`${pub}/${external.idRecurso}/visitas`, 'POST', {}, 201)
      ).token;
      await contact(token, '999111004');
      assert.deepEqual(
        await expect(`${pub}/descarga`, 'POST', undefined, 201, token),
        { externo: true, url: 'https://example.test/video' },
      );
      assert.equal(
        (await expect('/admin/actividad?descarga=externo')).total,
        0,
      );
      await expect(`${pub}/externo`, 'POST', undefined, 201, token);
      assert.equal(
        (await expect('/admin/actividad?descarga=externo')).total,
        1,
      );
      assert.equal(
        (
          await expect(
            `/admin/actividad?recurso=${external.idRecurso}&descarga=entregada`,
          )
        ).total,
        0,
      );
    },
  );
  await check(
    'Retirar publicación revoca enlaces y accesos; visitantes no pueden gestionar reservas',
    async () => {
      await expect(`/admin/recursos/${id}/estado`, 'PATCH', { activo: false });
      assert.deepEqual(await expect(pub), []);
      await expect(`${pub}/descarga`, 'POST', undefined, 404, downloadToken);
      await expect('/r/' + link.codigo, 'GET', undefined, 404);
      const savedCookie = cookie;
      cookie = '';
      await expect('/admin/reuniones', 'GET', undefined, 401);
      await expect(
        `/admin/reuniones/${meeting.idReunion}/cancelar`,
        'POST',
        { motivo: 'Sin sesión' },
        401,
      );
      cookie = savedCookie;
      await expect(
        `/admin/recursos/${id}`,
        'PATCH',
        resourceForm({ publicado: 'true', destacado: 'true' }),
      );
    },
  );
  await check(
    'Conversión manual conserva actividad; eliminar buyer anonimiza la solicitud',
    async () => {
      const token = await visit();
      await contact(token, '999111005');
      const buyer = (await expect('/admin/buyers?q=999111005')).items[0];
      const catalogs = await expect('/admin/catalogos');
      const converted = await expect(
        `/admin/buyers/${buyer.idBuyer}`,
        'PATCH',
        {
          nombres: buyer.nombres,
          telefono: buyer.telefono,
          correo: null,
          canalOrigen: buyer.canalOrigen,
          fechaRegistro: buyer.fechaRegistro,
          motivoCaptacion: 'descarga_recurso',
          estado: 'lead',
          idEstadoLead: catalogs.estados.find((e) => e.codigo === 'nuevo')
            .idEstado,
          motivoConversion: 'Solicitó reunión por teléfono',
        },
      );
      assert.equal(
        (await expect('/admin/actividad?lead=' + converted.idLead)).total,
        1,
      );
      assert.equal(
        (await expect('/admin/leads/' + converted.idLead)).reservaPendiente,
        true,
      );
      const deletedToken = await visit();
      await contact(deletedToken, '999111006');
      const deleted = (await expect('/admin/buyers?q=999111006')).items[0];
      await expect(`/admin/buyers/${deleted.idBuyer}`, 'DELETE');
      await expect(`${pub}/acceso`, 'GET', undefined, 401, deletedToken);
      const [stored] = await db.query(
        "SELECT nombres,telefono,id_buyer FROM solicitud_recurso WHERE token_hash=encode(sha256($1::bytea),'hex')",
        [Buffer.from(deletedToken)],
      );
      assert.equal(stored.nombres, null);
      assert.equal(stored.telefono, null);
      assert.equal(stored.id_buyer, null);
    },
  );
  if (process.env.JOURNEYS_UI_TARGET) {
    const requireFrontend = createRequire(
        new URL('../../tesispro-landing/package.json', import.meta.url),
      ),
      { chromium, expect: ui } = requireFrontend('@playwright/test');
    const backend = new URL(base),
      target = new URL(process.env.JOURNEYS_UI_TARGET);
    server = createServer((req, res) => {
      const api = req.url.startsWith('/api/'),
        redirect = req.url.startsWith('/r/'),
        upstream = api || redirect ? backend : target;
      const proxy = proxyRequest(
        {
          hostname: upstream.hostname,
          port: upstream.port,
          path: api ? req.url.slice(4) : req.url,
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
        viewport: { width: 1440, height: 1050 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await context.addCookies([
      { name: cookie.split('=')[0], value: cookie.split('=')[1], url: origin },
    ]);
    const output = resolve('../tesispro-landing/.artifacts/journeys');
    await mkdir(output, { recursive: true });
    await check(
      'Navegador: enlace social, nombre y teléfono, descarga, agenda y confirmación',
      async () => {
        await page.goto(origin + '/r/' + link.codigo);
        await ui(page.getByRole('dialog')).toBeVisible();
        const dialog = page.getByRole('dialog');
        await ui(
          dialog.getByLabel('Correo electrónico', { exact: true }),
        ).toHaveCount(0);
        await dialog.getByLabel('Nombre', { exact: true }).fill('Persona web');
        await dialog.getByLabel('Teléfono', { exact: true }).fill('999111010');
        await dialog.getByRole('checkbox').check();
        await dialog
          .getByRole('button', { name: 'Acceder al recurso', exact: true })
          .click();
        await ui(
          dialog.getByRole('button', {
            name: 'Descargar recurso',
            exact: true,
          }),
        ).toBeVisible();
        const downloading = page.waitForEvent('download');
        await dialog
          .getByRole('button', { name: 'Descargar recurso', exact: true })
          .click();
        await downloading;
        await dialog
          .getByRole('button', { name: 'Agendar reunión', exact: true })
          .click();
        await ui(
          dialog.getByRole('heading', { name: 'Agendar reunión', exact: true }),
        ).toBeVisible();
        const state = (await expect('/admin/leads?q=999111010')).items[0];
        assert.ok(state.reservaPendiente);
        const availableDate = slot.slice(0, 10);
        await dialog
          .getByLabel('Fecha de reunión', { exact: true })
          .fill(availableDate);
        await ui(
          dialog.locator('button[data-time-slot]').first(),
        ).toBeVisible();
        await dialog.locator('button[data-time-slot]').first().click();
        await dialog
          .getByLabel('Correo electrónico', { exact: true })
          .fill('persona-web@example.test');
        await dialog
          .getByLabel('Universidad', { exact: true })
          .fill('Universidad web');
        await dialog
          .getByLabel('Descripción de tu tema', { exact: true })
          .fill('Mi tema de tesis');
        await page.screenshot({
          path: resolve(output, 'agenda.png'),
          fullPage: false,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: resolve(output, 'agenda-movil.png'),
          fullPage: false,
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );

        await dialog
          .getByRole('button', { name: 'Confirmar reunión', exact: true })
          .click();
        await ui(
          dialog.getByRole('heading', {
            name: 'Reunión confirmada',
            exact: true,
          }),
        ).toBeVisible();
        await page.reload();
        await ui(
          page
            .getByRole('dialog')
            .getByRole('heading', { name: 'Reunión confirmada', exact: true }),
        ).toBeVisible();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: resolve(output, 'movil.png'),
          fullPage: false,
        });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      },
    );
    await check(
      'Navegador: publicación, generador de enlaces, historial y cancelación administrativa',
      async () => {
        await page.setViewportSize({ width: 1440, height: 1050 });
        await page.goto(origin + '/admin/recursos');
        const card = page.locator('article').filter({
          has: page.getByRole('heading', {
            name: 'Matriz de consistencia',
            exact: true,
          }),
        });
        await card
          .getByRole('button', { name: 'Enlaces', exact: true })
          .click();
        const dialog = page.getByRole('dialog');
        await dialog
          .getByLabel('Campaña *', { exact: true })
          .fill('campana_desde_panel');
        await dialog
          .getByRole('button', { name: 'Generar enlace', exact: true })
          .click();
        await ui(
          dialog.getByLabel('Enlace campana_desde_panel', { exact: true }),
        ).toBeVisible();
        await dialog.press('Escape');
        await card
          .getByRole('button', {
            name: 'Actividad Matriz de consistencia',
            exact: true,
          })
          .click();
        await ui(
          dialog.getByRole('heading', {
            name: 'Historial de recursos y reuniones',
            exact: true,
          }),
        ).toBeVisible();
        await dialog.press('Escape');
        await page
          .getByRole('link', { name: 'Reuniones', exact: true })
          .click();
        await page
          .getByLabel('Buscar reunión', { exact: true })
          .fill('persona-web@example.test');
        await ui(
          page.getByRole('heading', { name: 'Persona web', exact: true }),
        ).toBeVisible();
        const webMeeting = page.locator('article').filter({
          has: page.getByRole('heading', {
            name: 'Persona web',
            exact: true,
          }),
        });
        await webMeeting
          .getByRole('button', { name: 'Cancelar reunión', exact: true })
          .click();
        await dialog
          .getByLabel('Motivo de cancelación', { exact: true })
          .fill('Cambio de fecha');
        await dialog
          .getByRole('button', { name: 'Confirmar cancelación', exact: true })
          .click();
        await ui(dialog).toHaveCount(0);
        await ui(
          webMeeting.getByText('Cancelada', { exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: resolve(output, 'administracion.png'),
          fullPage: true,
        });
        assert.deepEqual(errors, []);
      },
    );
  }
  console.log(
    `${passed} grupos de pruebas del recorrido de recursos completados.`,
  );
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
