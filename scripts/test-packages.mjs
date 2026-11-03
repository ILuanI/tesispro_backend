// R11: only fictional fixtures in a temporary PostgreSQL schema. No operational migrations.
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer, request as proxyRequest } from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
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
import { ContractServices1792060000000 } from '../dist/migrations/1792060000000-ContractServices.js';
import { ResourceLibrary1792200000000 } from '../dist/migrations/1792200000000-ResourceLibrary.js';
import { BuyerProfiles1792300000000 } from '../dist/migrations/1792300000000-BuyerProfiles.js';
import { BuyerAcademicCatalogs1792310000000 } from '../dist/migrations/1792310000000-BuyerAcademicCatalogs.js';
import { ResourceJourneys1792400000000 } from '../dist/migrations/1792400000000-ResourceJourneys.js';
import { Referrals1792500000000 } from '../dist/migrations/1792500000000-Referrals.js';
import { ServicePackages1792600000000 } from '../dist/migrations/1792600000000-ServicePackages.js';
import { ServicioModule } from '../dist/modules/proyectos/servicio/servicio.module.js';
const schema = `r11_test_${randomBytes(8).toString('hex')}`;
const existingMode = process.argv.includes('--existing');
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
const requireFrontend = createRequire(
  new URL('../../tesispro_frontend/package.json', import.meta.url),
);
async function check(label, fn) {
  await fn();
  passed++;
  console.log('OK ' + label);
}
try {
  assert.notEqual(process.env.NODE_ENV, 'production');
  assert.match(schema, /^r11_test_[a-f0-9]{16}$/);
  await control.initialize();
  await control.query(`CREATE SCHEMA ${schema}`);
  const options = {
    ...connection,
    schema,
    extra: { options: `-c search_path=${schema}` },
    entities,
    synchronize: false,
    migrations: [
      InitialSchema1791855075011,
      AdminPanel1791900000000,
      ContractServices1792060000000,
      ResourceLibrary1792200000000,
      BuyerProfiles1792300000000,
      BuyerAcademicCatalogs1792310000000,
      ResourceJourneys1792400000000,
      Referrals1792500000000,
      ServicePackages1792600000000,
    ],
  };
  db = new DataSource(
    existingMode
      ? { ...options, migrations: options.migrations.slice(0, -1) }
      : options,
  );
  await db.initialize();
  await db.runMigrations();
  if (existingMode) {
    await db.query(
      await readFile(
        new URL('./fixtures/existing-packages.sql', import.meta.url),
        'utf8',
      ),
    );
    await db.destroy();
    db = new DataSource(options);
    await db.initialize();
    await db.runMigrations();
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='servicio' AND column_name='es_paquete'",
        )
      )[0].n,
      0,
    );
  }
  assert.equal(
    (await db.query('SELECT current_schema() AS name'))[0].name,
    schema,
  );
  const password = randomBytes(18).toString('hex');
  await db.query(
    `INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('Admin','R11','r11@example.test','administrador',$1)`,
    [await passwordHash(password)],
  );
  class Root {}
  Module({
    imports: [TypeOrmModule.forRoot(options), AdminModule, ServicioModule],
  })(Root);
  app = await NestFactory.create(Root, { logger: false });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  let origin = 'http://localhost:4321',
    cookie = '';
  process.env.APP_ORIGIN = origin;
  process.env.API_PROXY_TARGET = base;
  async function http(path, method = 'GET', body, headers = {}) {
    return fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async function expect(
    path,
    method = 'GET',
    body,
    status = 200,
    headers = {},
  ) {
    const res = await http(path, method, body, headers);
    const data = await res.json();
    assert.equal(res.status, status, `${path}: ${JSON.stringify(data)}`);
    return data;
  }
  await check(
    'Sesión, origen, campos permitidos y catálogo inicialmente vacío',
    async () => {
      await expect('/admin/paquetes', 'GET', undefined, 401);
      await expect('/admin/paquetes', 'POST', {}, 401);
      assert.deepEqual(await expect('/public/paquetes'), []);
      const res = await http('/auth/login', 'POST', {
        correo: 'r11@example.test',
        password,
      });
      assert.equal(res.status, 200);
      cookie = res.headers.get('set-cookie').split(';')[0];
      await expect('/admin/paquetes', 'POST', {}, 403, {
        Origin: 'https://otro.test',
      });
    },
  );
  const catalogs = await expect('/admin/paquetes/catalogos');
  const service = catalogs.servicios[0].idServicio;
  const blank = {
    codigo: 'PRUEBA_R11',
    nombre: 'Paquete de prueba R11',
    descripcion: null,
    publicoObjetivo: null,
    componentes: [],
    entregables: [],
    restricciones: [],
    precioFijo: null,
    moneda: 'PEN',
    modalidad: 'virtual',
    duracionDias: null,
    vigenciaDesde: null,
    vigenciaHasta: null,
    estado: 'borrador',
  };
  let p;
  await check(
    'Borrador sin valores inventados, duplicados y activación incompleta',
    async () => {
      p = await expect('/admin/paquetes', 'POST', blank, 201);
      assert.equal(p.precioFijo, null);
      assert.equal(p.version, 1);
      await expect('/admin/paquetes', 'POST', blank, 409);
      await expect(
        '/admin/paquetes',
        'POST',
        { ...blank, codigo: 'EXTRA', secreto: true },
        400,
      );
      await expect(
        `/admin/paquetes/${p.idServicio}/estado`,
        'PATCH',
        { estado: 'activo', version: 1 },
        400,
      );
      assert.deepEqual(await expect('/public/paquetes'), []);
    },
  );
  const body = (p) => ({
    codigo: p.codigo,
    nombre: p.nombre,
    descripcion: p.descripcion,
    publicoObjetivo: p.publicoObjetivo,
    componentes: p.componentes.map(({ idServicio, cantidad }) => ({
      idServicio,
      cantidad,
    })),
    entregables: p.entregables,
    restricciones: p.restricciones,
    precioFijo: p.precioFijo,
    moneda: p.moneda,
    modalidad: p.modalidad,
    duracionDias: p.duracionDias,
    vigenciaDesde: p.vigenciaDesde,
    vigenciaHasta: p.vigenciaHasta,
    estado: p.estado,
    version: p.version,
  });
  if (existingMode)
    await check(
      'Reconciliación conserva precios desde, permisos, prestaciones y snapshots anteriores',
      async () => {
        const [before] = await db.query(
        "SELECT * FROM paquete WHERE codigo='heredado_desde'",
        );
        const [oldVersion] = await db.query(
          'SELECT datos FROM paquete_version WHERE id_paquete=$1 AND version=1',
          [before.id],
        );
        const legacy = await expect(`/admin/paquetes/${before.id_servicio}`);
        assert.equal(legacy.tipoPrecio, 'desde');
        assert.equal(legacy.negociacionHabilitada, false);
        await expect(`/admin/paquetes/${before.id_servicio}`, 'PATCH', {
          ...body(legacy),
          nombre: 'Nombre heredado editado en prueba',
        });
        const [after] = await db.query('SELECT * FROM paquete WHERE id=$1', [
          before.id,
        ]);
        for (const key of [
          'categoria',
          'precio_tipo',
          'sesiones',
          'minutos_sesion',
          'cuotas',
          'prestaciones',
          'destacado',
          'opciones_negociacion',
          'negociacion_habilitada',
        ])
          assert.deepEqual(after[key], before[key], key);
        assert.deepEqual(
          (
            await db.query(
              'SELECT datos FROM paquete_version WHERE id_paquete=$1 AND version=1',
              [before.id],
            )
          )[0].datos,
          oldVersion.datos,
        );
        assert.equal(
          (await expect(`/admin/paquetes/${before.id_servicio}/historial`))
            .total,
          2,
        );
        assert.deepEqual(await expect('/public/paquetes'), []);
      },
    );
  await check(
    'Precio, fechas, listas, componentes y publicación autorizada',
    async () => {
      for (const precioFijo of ['-1.00', '1.001', '1e3'])
        await expect(
          `/admin/paquetes/${p.idServicio}`,
          'PATCH',
          { ...body(p), precioFijo },
          400,
        );
      await expect(
        `/admin/paquetes/${p.idServicio}`,
        'PATCH',
        {
          ...body(p),
          vigenciaDesde: '2026-12-02',
          vigenciaHasta: '2026-12-01',
        },
        400,
      );
      await expect(
        `/admin/paquetes/${p.idServicio}`,
        'PATCH',
        {
          ...body(p),
          componentes: [{ idServicio: p.idServicio, cantidad: 1 }],
        },
        400,
      );
      p = await expect(`/admin/paquetes/${p.idServicio}`, 'PATCH', {
        ...body(p),
        descripcion: 'Alcance exclusivamente de prueba',
        componentes: [{ idServicio: service, cantidad: 2 }],
        entregables: ['Entrega de prueba'],
        restricciones: ['Restricción de prueba'],
        precioFijo: '500.25',
        estado: 'activo',
      });
      const pub = await expect('/public/paquetes');
      assert.equal(pub.length, 1);
      assert.equal(pub[0].precioFijo, '500.25');
      assert.equal(pub[0].version, 2);
      assert.equal(pub[0].fechaCreacion, undefined);
      assert.equal(pub[0].idUsuario, undefined);
    },
  );
  await check(
    existingMode?'Concurrencia optimista e historial sin sobrescritura':'Concurrencia optimista, historial y versiones inmutables',
    async () => {
      const changes = await Promise.all([
        http(`/admin/paquetes/${p.idServicio}`, 'PATCH', {
          ...body(p),
          publicoObjetivo: 'Perfil A de prueba',
        }),
        http(`/admin/paquetes/${p.idServicio}`, 'PATCH', {
          ...body(p),
          publicoObjetivo: 'Perfil B de prueba',
        }),
      ]);
      assert.deepEqual(changes.map((r) => r.status).sort(), [200, 409]);
      p = await expect(`/admin/paquetes/${p.idServicio}`);
      assert.equal(p.version, 3);
      const history = await expect(`/admin/paquetes/${p.idServicio}/historial`);
      assert.equal(history.total, 3);
      assert.equal(history.items[0].administrador, 'Admin R11');
      assert.equal(history.items[1].cambios.precioFijo.nuevo, '500.25');
      if (!existingMode)
        await assert.rejects(
          db.query(
            'UPDATE paquete_version SET contenido=$1 WHERE id_version=$2',
            [{}, history.items[0].idVersion],
          ),
          /inmutable/,
        );
    },
  );
  const [{ id_estado }] = await db.query(
    `SELECT id_estado FROM estado_lead WHERE codigo='nuevo'`,
  );
  const [lead] = await db.query(
    `INSERT INTO lead(nombres,correo,telefono,id_estado) VALUES('Lead R11','lead-r11@example.test','999110001',$1) RETURNING id_lead`,
    [id_estado],
  );
  const contractPayload = (pkg) => ({
    idLead: lead.id_lead,
    paquete: { idServicio: pkg.idServicio, version: pkg.version },
    fechaFirma: new Date().toISOString(),
    versionClausulas: 'R11-test',
    aceptaAutoriaEstudiante: true,
  });
  let first, newer, scheduleBefore, paymentsBefore;
  await check(
    'Contrato usa precio servidor; rechaza precio manipulado y versión caducada',
    async () => {
      await expect(
        '/admin/contratos',
        'POST',
        {
          ...contractPayload(p),
          paquete: {
            idServicio: p.idServicio,
            version: p.version,
            precioFijo: '0.01',
          },
        },
        400,
      );
      await expect(
        '/admin/contratos',
        'POST',
        {
          ...contractPayload(p),
          paquete: { idServicio: p.idServicio, version: 1 },
        },
        409,
      );
      first = await expect('/admin/contratos', 'POST', contractPayload(p), 201);
      assert.equal(first.montoTotal, '500.25');
      assert.equal(first.paquete.version, 3);
      assert.equal(first.editableFinanciero, false);
      await expect(
        `/admin/contratos/${first.idContrato}`,
        'PATCH',
        { propuesta: first.propuesta },
        400,
      ); // Extra proposal persistence fields rejected by DTO.
      const preview = await expect(
        `/admin/contratos/${first.idContrato}/cronograma/preview`,
        'POST',
        { cantidad: 2, primerVencimiento: '2026-12-10' },
        201,
      );
      await expect(
        `/admin/contratos/${first.idContrato}/cronograma`,
        'POST',
        { cuotas: preview.cuotas },
        201,
      );
      const schedule = await expect(
        `/admin/contratos/${first.idContrato}/cronograma`,
      );
      await expect(
        `/admin/cuotas/${schedule.cuotas[0].idCuota}/abonos`,
        'POST',
        {
          monto: '10.00',
          fechaPago: new Date().toISOString(),
          metodo: 'transferencia',
          claveIdempotencia: randomUUID(),
        },
        201,
      );
      scheduleBefore = await db.query(
        'SELECT * FROM cuota_pago ORDER BY id_cuota',
      );
      paymentsBefore = await db.query('SELECT * FROM pago ORDER BY id_pago');
    },
  );
  await check(
    'Cambio de precio y contenido preserva contrato, cuotas y pagos previos',
    async () => {
      p = await expect(`/admin/paquetes/${p.idServicio}`, 'PATCH', {
        ...body(p),
        nombre: 'Paquete actualizado de prueba',
        precioFijo: '650.50',
        entregables: ['Nueva entrega de prueba'],
        restricciones: ['Nueva restricción de prueba'],
      });
      const old = await expect(`/admin/contratos/${first.idContrato}`);
      assert.equal(old.montoTotal, '500.25');
      assert.equal(old.paquete.nombre, 'Paquete de prueba R11');
      assert.deepEqual(old.paquete.entregables, ['Entrega de prueba']);
      assert.deepEqual(old.paquete.restricciones, ['Restricción de prueba']);
      assert.deepEqual(
        await db.query('SELECT * FROM cuota_pago ORDER BY id_cuota'),
        scheduleBefore,
      );
      assert.deepEqual(
        await db.query('SELECT * FROM pago ORDER BY id_pago'),
        paymentsBefore,
      );
      newer = await expect('/admin/contratos', 'POST', contractPayload(p), 201);
      assert.equal(newer.montoTotal, '650.50');
      assert.equal(newer.paquete.version, 4);
      await expect(
        `/admin/contratos/${newer.idContrato}`,
        'PATCH',
        { fechaFirma: new Date().toISOString() },
        409,
      );
      await expect(`/admin/contratos/${newer.idContrato}`, 'PATCH', {
        versionClausulas: 'R11-doc',
      });
    },
  );
  await check(
    'Servicios individuales y acuerdos anteriores continúan funcionando',
    async () => {
      const old = await expect(
        '/admin/contratos',
        'POST',
        {
          idLead: lead.id_lead,
          propuesta: {
            moneda: 'PEN',
            modalidad: 'virtual',
            detalles: [
              {
                idServicio: service,
                cantidad: 1,
                precioUnitario: '123.45',
                descuento: '0.00',
              },
            ],
          },
          fechaFirma: new Date().toISOString(),
          versionClausulas: 'Legacy',
          aceptaAutoriaEstudiante: true,
        },
        201,
      );
      assert.equal(old.montoTotal, '123.45');
      assert.equal(old.paquete, null);
      const cat = await expect('/admin/contratos/catalogos');
      assert.equal(
        cat.servicios.some((s) => s.idServicio === p.idServicio),
        false,
      );
    },
  );
  await check(
    'CRUD individual conservado, paquetes protegidos y componentes acordados inmutables',
    async () => {
      await expect(
        `/servicio/${p.idServicio}`,
        'PATCH',
        { nombre: 'Intento de omitir versiones' },
        403,
      );
      await expect(`/servicio/${p.idServicio}`, 'DELETE', undefined, 403);
      await expect(
        '/servicio',
        'POST',
        {
          codigo: 'BYPASS',
          nombre: 'Intento',
          precioBase: '1.00',
          esPaquete: true,
        },
        403,
      );
      const pub = await expect('/public/paquetes');
      const before = pub.find((x) => x.idServicio === p.idServicio).componentes;
      await expect(`/servicio/${service}`, 'PATCH', {
        nombre: 'Nombre individual actualizado en prueba',
      });
      const after = (await expect('/public/paquetes')).find(
        (x) => x.idServicio === p.idServicio,
      ).componentes;
      assert.deepEqual(after, before);
      p = await expect(`/admin/paquetes/${p.idServicio}`, 'PATCH', body(p));
      const audited = await expect(`/admin/paquetes/${p.idServicio}/historial`);
      assert.deepEqual(audited.items[0].cambios.componentes.anterior, before);
      assert.equal(
        audited.items[0].cambios.componentes.nuevo[0].nombre,
        'Nombre individual actualizado en prueba',
      );
    },
  );
  const { build } = createRequire(
    requireFrontend.resolve('astro/package.json'),
  )('esbuild');
  async function load(path) {
    const result = await build({
      entryPoints: [resolve('../tesispro_frontend', path)],
      bundle: true,
      platform: 'node',
      format: 'esm',
      write: false,
      define: { 'import.meta.env': JSON.stringify({ DEV: false }) },
    });
    return import(
      'data:text/javascript;base64,' +
        Buffer.from(result.outputFiles[0].text).toString('base64')
    );
  }
  const endpoint = await load('src/pages/api/negotiation.ts'),
    domain = await load('src/lib/negotiation.ts');
  const tesi = async (message, state = domain.initialState()) => {
    const response = await endpoint.POST({
      request: new Request('http://localhost:4321/api/negotiation', {
        method: 'POST',
        headers: {
          Origin: 'http://localhost:4321',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message, history: [], state }),
      }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  await check(
    'Astro Tesi consume PostgreSQL: precio preciso, sin descuento y cambio de versión',
    async () => {
      let turn = await tesi(`Paquete ${p.codigo}`, {
        ...domain.initialState(),
        need: 'Revisión de tesis',
        thesisStage: 'Desarrollo de tesis',
      });
      assert.equal(turn.proposal.min, 650.5);
      assert.equal(turn.proposal.discount, 0);
      assert.equal(turn.state.service, `paquete-${p.idServicio}`);
      turn = await tesi('Quiero un descuento', { ...turn.state, discount: 10 });
      assert.equal(turn.proposal.min, 650.5);
      assert.equal(turn.proposal.discount, 0);
      assert.ok(!turn.reply.includes('10%'));
      const previous = turn.state;
      p = await expect(`/admin/paquetes/${p.idServicio}`, 'PATCH', {
        ...body(p),
        precioFijo: '700.75',
      });
      turn = await tesi('Acepto', previous);
      assert.equal(turn.readyForHandoff, false);
      assert.equal(turn.proposal.min, 700.75);
      assert.match(turn.reply, /cambiaron/);
    },
  );
  await check(
    'Vigencia, filtros e inactivos fuera de Tesi y contratación nueva',
    async () => {
      const future = await expect(
        '/admin/paquetes',
        'POST',
        {
          ...body(p),
          version: undefined,
          codigo: 'FUTURO_R11',
          nombre: 'Futuro de prueba',
          vigenciaDesde: '2099-01-01',
        },
        201,
      );
      assert.ok(
        !(await expect('/public/paquetes')).some(
          (x) => x.idServicio === future.idServicio,
        ),
      );
      assert.equal(
        (
          await expect(
            '/admin/paquetes?estado=activo&precioMin=600&precioMax=800',
          )
        ).total,
        2,
      );
      assert.equal((await expect('/admin/paquetes?vigencia=futuro')).total, 1);
      p = await expect(`/admin/paquetes/${p.idServicio}/estado`, 'PATCH', {
        estado: 'inactivo',
        version: p.version,
      });
      assert.deepEqual(await expect('/public/paquetes'), []);
      const turn = await tesi('¿Qué precio tienen?', {
        ...domain.initialState(),
        service: `paquete-${p.idServicio}`,
        packageVersion: p.version,
        discount: 10,
      });
      assert.equal(turn.proposal, null);
      assert.match(turn.reply, /No hay paquetes/);
      assert.ok(!turn.reply.includes('S/'));
      await expect('/admin/contratos', 'POST', contractPayload(p), 409);
      assert.equal(
        (await expect(`/admin/contratos/${first.idContrato}`)).montoTotal,
        '500.25',
      );
    },
  );
  if (process.argv.includes('--browser')) {
    const { chromium, expect: ui } = requireFrontend('@playwright/test');
    const frontend = process.env.R11_FRONTEND_ORIGIN || 'http://localhost:4321';
    server = createServer((req, res) => {
      const api =
        req.url.startsWith('/api/') &&
        !req.url.startsWith('/api/negotiation') &&
        !req.url.startsWith('/api/faq-ai');
      const target = new URL(
        api ? req.url.slice(4) : req.url,
        api ? base : frontend,
      );
      const proxy = proxyRequest(
        target,
        { method: req.method, headers: { ...req.headers, host: target.host } },
        (r) => {
          res.writeHead(r.statusCode || 502, r.headers);
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
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const login = await http('/auth/login', 'POST', {
      correo: 'r11@example.test',
      password,
    });
    await ctx.addCookies([
      {
        name: 'tesispro_session',
        value: login.headers.get('set-cookie').split(';')[0].split('=')[1],
        url: origin,
      },
    ]);
    const page = await ctx.newPage(),
      errors = [],
      consoleErrors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text());
    });
    const output = resolve('.artifacts/r11');
    await mkdir(output, { recursive: true });
    await check(
      'UI real: crear, servicios, entregables, restricciones, activar, editar e historial',
      async () => {
        await page.goto(origin + '/admin/paquetes');
        await ui(
          page.getByRole('heading', { name: 'Paquetes', exact: true }),
        ).toBeVisible();
        await page
          .getByRole('button', { name: 'Crear paquete', exact: true })
          .click();
        let dialog = page.getByRole('dialog');
        await dialog.getByLabel('Código *', { exact: true }).fill('UI_R11');
        await dialog
          .getByLabel('Nombre *', { exact: true })
          .fill('Paquete UI de prueba');
        await dialog
          .getByLabel('Descripción', { exact: true })
          .fill('Descripción solo para pruebas aisladas');
        await dialog
          .getByRole('button', { name: 'Agregar servicio', exact: true })
          .click();
        await dialog
          .getByLabel('Servicio 1', { exact: true })
          .selectOption(String(service));
        await dialog
          .getByRole('button', { name: 'Agregar entregable', exact: true })
          .click();
        await dialog
          .getByLabel('Entregable 1', { exact: true })
          .fill('Entrega UI de prueba');
        await dialog
          .getByRole('button', { name: 'Agregar restricción', exact: true })
          .click();
        await dialog
          .getByLabel('Restricción 1', { exact: true })
          .fill('Restricción UI de prueba');
        await dialog.getByLabel('Precio fijo', { exact: true }).fill('85.35');
        await dialog
          .getByRole('button', { name: 'Guardar paquete', exact: true })
          .click();
        await ui(dialog).toHaveCount(0);
        await page
          .getByRole('button', {
            name: 'Activar Paquete UI de prueba',
            exact: true,
          })
          .click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Confirmar estado' })
          .click();
        await ui(page.getByRole('dialog')).toHaveCount(0);
        await page
          .getByRole('button', {
            name: 'Editar Paquete UI de prueba',
            exact: true,
          })
          .click();
        dialog = page.getByRole('dialog');
        await dialog.getByLabel('Precio fijo', { exact: true }).fill('95.45');
        await dialog
          .getByRole('button', { name: 'Agregar entregable', exact: true })
          .click();
        await dialog
          .getByLabel('Entregable 2', { exact: true })
          .fill('Segunda entrega de prueba');
        await page.screenshot({
          path: resolve(output, 'formulario.png'),
          fullPage: true,
        });
        await dialog
          .getByRole('button', { name: 'Guardar paquete', exact: true })
          .click();
        await ui(dialog).toHaveCount(0);
        await page
          .getByRole('button', {
            name: 'Historial Paquete UI de prueba',
            exact: true,
          })
          .click();
        await page.getByRole('dialog').locator('summary').first().click();
        await ui(
          page
            .getByRole('dialog')
            .getByText('Precio fijo', { exact: true })
            .first(),
        ).toBeVisible();
        await page.screenshot({
          path: resolve(output, 'historial.png'),
          fullPage: true,
        });
        await page.keyboard.press('Escape');
        await page
          .getByLabel('Nombre o código', { exact: true })
          .fill('UI_R11');
        await ui(
          page
            .getByRole('table')
            .getByText('Futuro de prueba', { exact: true }),
        ).toHaveCount(0);
        await page.screenshot({
          path: resolve(output, 'paquetes-escritorio.png'),
          fullPage: true,
        });
        await page.setViewportSize({ width: 768, height: 1024 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.screenshot({
          path: resolve(output, 'paquetes-tablet.png'),
          fullPage: true,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.screenshot({
          path: resolve(output, 'paquetes-movil.png'),
          fullPage: true,
        });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(origin + '/admin/contratos');
        await page
          .getByRole('button', { name: 'Nuevo contrato', exact: true })
          .click();
        dialog = page.getByRole('dialog');
        await dialog
          .getByRole('button', { name: /Lead R11.*lead-r11@example.test/ })
          .click();
        const [uiPackage] = await db.query(
          "SELECT id_servicio FROM servicio WHERE codigo='UI_R11'",
        );
        await dialog
          .getByLabel('Paquete autorizado (opcional)', { exact: true })
          .selectOption(String(uiPackage.id_servicio));
        await dialog.getByRole('checkbox').check();
        await dialog
          .getByRole('button', { name: 'Guardar contrato', exact: true })
          .click();
        await ui(
          page
            .getByRole('dialog')
            .getByRole('heading', { name: 'Contrato registrado', exact: true }),
        ).toBeVisible();
        await ui(page.getByRole('dialog').getByText(/95[.,]45/)).toBeVisible();
        await page.screenshot({
          path: resolve(output, 'contrato-paquete.png'),
          fullPage: true,
        });
        await page.goto(origin + '/admin/paquetes');
        await page
          .getByRole('button', {
            name: 'Desactivar Paquete UI de prueba',
            exact: true,
          })
          .click();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: 'Confirmar estado' })
          .click();
        await ui(page.getByRole('dialog')).toHaveCount(0);
        assert.deepEqual(errors, []);
        await writeFile(
          resolve(output, 'consola.json'),
          JSON.stringify({ errors, consoleErrors }, null, 2),
        );
        assert.deepEqual(consoleErrors, []);
      },
    );
    await ctx.close();
  }
  console.log(
    `${passed} grupos R11 aprobados. Solo fixtures de prueba en esquema temporal.`,
  );
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((done) => server.close(done));
  if (app) await app.close();
  if (db?.isInitialized) await db.destroy();
  if (control.isInitialized) {
    assert.match(schema, /^r11_test_[a-f0-9]{16}$/);
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.destroy();
  }
}
