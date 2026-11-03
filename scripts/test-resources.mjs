import { currentMigrations } from './test-migrations.mjs';
import { TesiQualification1792600000000 } from '../dist/migrations/1792600000000-TesiQualification.js';
import { LeadProfiling1792500000000 } from '../dist/migrations/1792500000000-LeadProfiling.js';
import { ResourceJourneys1792400000000 } from '../dist/migrations/1792400000000-ResourceJourneys.js';
// HTTP y PostgreSQL reales; todos los datos se aíslan en un esquema temporal.
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
import { ResourceLibrary1792200000000 } from '../dist/migrations/1792200000000-ResourceLibrary.js';

const schema = `resources_test_${randomBytes(8).toString('hex')}`;
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
  await db.query(
    "INSERT INTO grado_academico(codigo,nombre) VALUES('prueba','Grado de prueba')",
  );
  const [{ id_grado: grade }] = await db.query(
    "SELECT id_grado FROM grado_academico WHERE codigo='prueba'",
  );
  const [{ id_etapa: stage }] = await db.query(
    "INSERT INTO etapa_tesis(nombre,orden,id_grado) VALUES('Etapa de prueba',1,$1) RETURNING id_etapa",
    [grade],
  );
  const password = randomBytes(18).toString('hex');
  await db.query(
    "INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('Admin','Recursos','resources@example.test','administrador',$1)",
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
  async function http(path, method = 'GET', body, headers = {}) {
    const multipart = body instanceof FormData;
    return fetch(`${base}${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? (multipart ? body : JSON.stringify(body)) : undefined,
    });
  }
  async function expect(path, method = 'GET', body, status = 200) {
    const res = await http(path, method, body);
    const data = await res.json();
    assert.equal(res.status, status, `${path}: ${JSON.stringify(data)}`);
    return data;
  }
  const root = '/admin/recursos';
  const dto = {
    titulo: 'Guía de prueba',
    descripcion: 'Material de investigación',
    categoria: 'asesoria_academica',
    formato: 'pdf',
    activo: true,
    idGrado: grade,
    idEtapa: stage,
    archivoUrl: 'https://example.test/guia.pdf',
  };
  await check(
    'Sesión y origen obligatorios, incluida la descarga',
    async () => {
      for (const [path, method] of [
        [root, 'GET'],
        [root, 'POST'],
        [`${root}/1`, 'PATCH'],
        [`${root}/1`, 'DELETE'],
        [`${root}/1/archivo`, 'GET'],
      ])
        await expect(path, method, undefined, 401);
      const res = await http('/auth/login', 'POST', {
        correo: 'resources@example.test',
        password,
      });
      assert.equal(res.status, 200);
      cookie = res.headers.get('set-cookie').split(';')[0];
      assert.equal(
        (await http(root, 'POST', dto, { Origin: 'https://other.test' }))
          .status,
        403,
      );
    },
  );
  const catalogs = await expect(`${root}/catalogos`);
  assert.equal(catalogs.categorias.length, 5);
  assert.equal(catalogs.formatos.length, 5);
  let first;
  await check(
    'Crear las cuatro categorías y formatos y recuperar el detalle',
    async () => {
      for (let i = 0; i < 4; i++) {
        const saved = await expect(
          root,
          'POST',
          {
            ...dto,
            titulo: `Recurso ${i}`,
            categoria: catalogs.categorias[i].value,
            formato: catalogs.formatos[i].value,
          },
          201,
        );
        if (!i) first = saved;
        assert.equal(
          (await expect(`${root}/${saved.idRecurso}`)).formato,
          catalogs.formatos[i].value,
        );
      }
    },
  );
  await check(
    'Filtros combinados, paginación, orden y búsqueda literal',
    async () => {
      const list = await expect(
        `${root}?categoria=asesoria_academica&formato=pdf&activo=true&idGrado=${grade}&idEtapa=${stage}&q=investigaci`,
      );
      assert.equal(list.total, 1);
      assert.equal(list.items[0].idRecurso, first.idRecurso);
      assert.equal(
        (await expect(`${root}?page=2&pageSize=2&sort=titulo&direction=asc`))
          .items[0].titulo,
        'Recurso 2',
      );
      assert.equal((await expect(`${root}?q=%25`)).total, 0);
      assert.equal(
        (await expect(`${root}?desde=2000-01-01&hasta=2000-01-02`)).total,
        0,
      );
    },
  );
  await check(
    'Validación de datos, URL, filtros y registros inexistentes',
    async () => {
      for (const patch of [
        { categoria: 'otro' },
        { formato: 'exe' },
        { titulo: '  ' },
        { activo: 'quizás' },
        { archivoUrl: 'javascript:alert(1)' },
        { idEtapa: 999999 },
        { idGrado: 999999 },
      ])
        await expect(root, 'POST', { ...dto, ...patch }, 400);
      await expect(root, 'POST', { ...dto, archivoUrl: undefined }, 400);
      for (const query of [
        'formato=exe',
        'page=0',
        'sort=sql',
        'desde=2026-12-01&hasta=2026-01-01',
      ])
        await expect(`${root}?${query}`, 'GET', undefined, 400);
      await expect(`${root}/999999`, 'GET', undefined, 404);
      await expect(`${root}/999999/estado`, 'PATCH', { activo: false }, 404);
      await expect(`${root}/999999`, 'DELETE', undefined, 404);
    },
  );
  function multipart(fields, filename, buffer) {
    const form = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.set(key, String(value));
    });
    if (filename) form.set('archivo', new Blob([buffer]), filename);
    return form;
  }
  const files = [
    ['pdf', 'guía.pdf', Buffer.from('%PDF-1.4\nContenido de prueba')],
    ['word', 'plantilla.docx', Buffer.from('504b030400000000', 'hex')],
    [
      'video',
      'clase.mp4',
      Buffer.from('000000186674797069736f6d00000000', 'hex'),
    ],
    ['png', 'matriz.png', Buffer.from('89504e470d0a1a0a00000000', 'hex')],
  ];
  let uploaded;
  await check(
    'Subida y descarga exacta de PDF, Word, video y PNG',
    async () => {
      for (const [format, name, bytes] of files) {
        const saved = await expect(
          root,
          'POST',
          multipart(
            {
              ...dto,
              titulo: `Archivo ${format}`,
              formato: format,
              archivoUrl: undefined,
            },
            name,
            bytes,
          ),
          201,
        );
        assert.equal(saved.archivoSubido, true);
        assert.equal(saved.archivoNombre, name);
        assert.equal(saved.archivoBytes, bytes.length);
        const downloaded = await http(`${root}/${saved.idRecurso}/archivo`);
        assert.equal(downloaded.status, 200);
        assert.match(
          downloaded.headers.get('content-disposition'),
          /attachment/,
        );
        assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
        if (format === 'pdf') uploaded = saved;
      }
    },
  );
  await check(
    'Rechazo de archivo incompatible, vacío, excesivo y archivo más URL',
    async () => {
      await expect(
        root,
        'POST',
        multipart(
          { ...dto, archivoUrl: undefined },
          'falso.pdf',
          Buffer.from('no es PDF'),
        ),
        400,
      );
      await expect(
        root,
        'POST',
        multipart(
          { ...dto, archivoUrl: undefined },
          'vacio.pdf',
          Buffer.alloc(0),
        ),
        400,
      );
      const large = Buffer.alloc(25 * 1024 * 1024 + 1);
      large.write('%PDF-');
      await expect(
        root,
        'POST',
        multipart({ ...dto, archivoUrl: undefined }, 'grande.pdf', large),
        413,
      );
      await expect(root, 'POST', multipart(dto, 'guia.pdf', files[0][2]), 400);
    },
  );
  await check(
    'Edición conserva archivos; reemplazo y cambio a enlace externo',
    async () => {
      await expect(`${root}/${uploaded.idRecurso}`, 'PATCH', {
        ...dto,
        titulo: 'Título corregido',
        archivoUrl: undefined,
      });
      assert.equal(
        (await expect(`${root}/${uploaded.idRecurso}`)).archivoSubido,
        true,
      );
      await expect(
        `${root}/${uploaded.idRecurso}`,
        'PATCH',
        { ...dto, formato: 'video', archivoUrl: undefined },
        400,
      );
      const replaced = await expect(
        `${root}/${uploaded.idRecurso}`,
        'PATCH',
        multipart(
          { ...dto, formato: 'png', archivoUrl: undefined },
          files[3][1],
          files[3][2],
        ),
      );
      assert.equal(replaced.formato, 'png');
      const external = await expect(`${root}/${uploaded.idRecurso}`, 'PATCH', {
        ...dto,
        formato: 'video',
        archivoUrl: 'https://example.test/clase',
      });
      assert.equal(external.archivoSubido, false);
      await expect(
        `${root}/${uploaded.idRecurso}/archivo`,
        'GET',
        undefined,
        404,
      );
    },
  );
  await check(
    'Activar, desactivar, eliminar y proteger el historial',
    async () => {
      await expect(`${root}/${first.idRecurso}/estado`, 'PATCH', {
        activo: false,
      });
      assert.equal((await expect(`${root}?activo=false`)).total, 1);
      await expect(`${root}/${first.idRecurso}/estado`, 'PATCH', {
        activo: true,
      });
      await db.query('INSERT INTO sesion_landing(id_recurso) VALUES($1)', [
        first.idRecurso,
      ]);
      await expect(`${root}/${first.idRecurso}`, 'DELETE', undefined, 409);
      await expect(`${root}/${uploaded.idRecurso}`, 'DELETE');
      await expect(`${root}/${uploaded.idRecurso}`, 'GET', undefined, 404);
    },
  );
  await check('Categoria de tesis y contenido orientativo enlazado', async () => {
    const saved=await expect(root,'POST',{...dto,titulo:'Contenido orientativo',categoria:'elaboracion_tesis',formato:'orientativo'},201);
    assert.equal((await expect(`${root}/${saved.idRecurso}`)).formato,'orientativo');
  });
  if (process.env.RESOURCES_UI_TARGET) {
    const requireFrontend = createRequire(
      new URL('../../tesispro-landing/package.json', import.meta.url),
    );
    const { chromium, expect: uiExpect } = requireFrontend('@playwright/test');
    const target = new URL(process.env.RESOURCES_UI_TARGET),
      backend = new URL(base);
    server = createServer((req, res) => {
      const api = req.url.startsWith('/api/');
      const upstream = api ? backend : target;
      const proxy = proxyRequest(
        {
          hostname: upstream.hostname,
          port: upstream.port,
          path: api ? req.url.slice(4) : req.url,
          method: req.method,
          headers: { ...req.headers, host: upstream.host },
        },
        (response) => {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
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
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.addCookies([
      { name: cookie.split('=')[0], value: cookie.split('=')[1], url: origin },
    ]);
    await check(
      'Interfaz: crear, editar, filtrar, iconos y persistencia al recargar',
      async () => {
        await page.goto(`${origin}/admin/recursos`);
        await uiExpect(
          page.getByRole('heading', { name: 'Recursos', exact: true }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Nuevo recurso', exact: true })
          .click();
        const dialog = page.getByRole('dialog');
        await dialog
          .getByLabel('Título', { exact: true })
          .fill('Video desde el panel');
        await dialog
          .getByLabel('Categoría', { exact: true })
          .selectOption('guias_universitarias');
        await dialog
          .getByLabel('Formato', { exact: true })
          .selectOption('video');
        await dialog.getByLabel('Archivo', { exact: true }).setInputFiles({
          name: 'clase.mp4',
          mimeType: 'video/mp4',
          buffer: files[2][2],
        });
        await dialog
          .getByRole('button', { name: 'Guardar recurso', exact: true })
          .click();
        await uiExpect(dialog).toHaveCount(0);
        const card = page
          .locator('article')
          .filter({ hasText: 'Video desde el panel' });
        await uiExpect(
          card.getByLabel('Formato Video', { exact: true }),
        ).toBeVisible();
        await page.reload();
        await uiExpect(card).toBeVisible();
        await page
          .getByRole('button', {
            name: 'Editar Video desde el panel',
            exact: true,
          })
          .click();
        await dialog
          .getByLabel('Título', { exact: true })
          .fill('Video editado');
        await dialog
          .getByRole('button', { name: 'Guardar recurso', exact: true })
          .click();
        await uiExpect(dialog).toHaveCount(0);
        await page
          .getByLabel('Buscar recurso', { exact: true })
          .fill('Video editado');
        await uiExpect(page.locator('article')).toHaveCount(1);
        await page.getByLabel('Formato', { exact: true }).selectOption('png');
        await uiExpect(
          page.getByText('No hay recursos para mostrar', { exact: true }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Limpiar filtros', exact: true })
          .first()
          .click();
        await uiExpect(page.locator('article').first()).toBeVisible();
        await mkdir(resolve('../tesispro-landing/.artifacts/recursos'), {
          recursive: true,
        });
        await page.screenshot({
          path: resolve(
            '../tesispro-landing/.artifacts/recursos/escritorio.png',
          ),
          fullPage: true,
        });
      },
    );
    await check('Interfaz: estado, eliminación y vista móvil', async () => {
      await page
        .getByRole('button', { name: 'Desactivar Video editado', exact: true })
        .click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Confirmar', exact: true })
        .click();
      await uiExpect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByLabel('Estado', { exact: true }).selectOption('false');
      await uiExpect(page.locator('article')).toHaveCount(1);
      await page
        .getByRole('button', { name: 'Eliminar Video editado', exact: true })
        .click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Confirmar', exact: true })
        .click();
      await uiExpect(page.getByRole('dialog')).toHaveCount(0);
      await page
        .getByRole('button', { name: 'Limpiar filtros', exact: true })
        .first()
        .click();
      await page.setViewportSize({ width: 390, height: 844 });
      await uiExpect(page.locator('article').first()).toBeVisible();
      await uiExpect(
        page.getByRole('heading', { name: 'Recursos', exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: resolve('../tesispro-landing/.artifacts/recursos/movil.png'),
        fullPage: true,
      });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        true,
      );
      assert.deepEqual(errors, []);
    });
  }
  console.log(`${passed} grupos de pruebas de recursos completados.`);
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
