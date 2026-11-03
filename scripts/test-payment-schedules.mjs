import { PaymentLegacyChecks1792910000000 } from '../dist/migrations/1792910000000-PaymentLegacyChecks.js';
import { PaymentVerification1792900000000 } from '../dist/migrations/1792900000000-PaymentVerification.js';
import { verifiedFixturePayment } from './payment-test-helpers.mjs';
import { PaymentActivationGuard1792810000000 } from '../dist/migrations/1792810000000-PaymentActivationGuard.js';
// Financial integration tests are isolated in a randomly named PostgreSQL schema.
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { entities } from '../dist/entities/index.js';
import { AdminModule } from '../dist/modules/admin/admin.module.js';
import { passwordHash } from '../dist/modules/admin/auth.js';
import { FlexiblePaymentSchedules1792800000000 } from '../dist/migrations/1792800000000-FlexiblePaymentSchedules.js';

const schema = `payment_test_${randomBytes(8).toString('hex')}`;
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
  browser,
  passed = 0;
const origin = 'http://localhost:4321';
process.env.APP_ORIGIN = origin;
const password = randomBytes(12).toString('hex');
async function check(name, fn) {
  await fn();
  console.log(`OK ${++passed} ${name}`);
}
try {
  await control.initialize();
  await control.query(`CREATE SCHEMA ${schema}`);
  const migrations = [];
  for (const file of (
    await readdir(new URL('../dist/migrations/', import.meta.url))
  )
    .filter(
      (f) =>
        f.endsWith('.js') &&
        !f.includes('1792800000000') &&
        !f.includes('1792810000000') && !f.includes('1792900000000') && !f.includes('1792910000000'),
    )
    .sort()) {
    const module = await import(
      new URL(`../dist/migrations/${file}`, import.meta.url)
    );
    migrations.push(
      ...Object.values(module).filter((x) => typeof x === 'function'),
    );
  }
  const options = {
    ...connection,
    schema,
    extra: { options: `-c search_path=${schema}` },
    entities,
    synchronize: false,
    migrations,
  };
  db = new DataSource(options);
  await db.initialize();
  await db.runMigrations();
  const [admin] = await db.query(
    "INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('R13','Admin','r13@example.test','administrador',$1) RETURNING id_usuario",
    [await passwordHash(password)],
  );
  const [lead] = await db.query(
    "INSERT INTO lead(nombres,correo,id_estado) SELECT 'R13','lead-r13@example.test',id_estado FROM estado_lead WHERE codigo='nuevo' RETURNING id_lead",
  );
  async function contract(total = '2500.00', state = 'aceptada') {
    const [p] = await db.query(
      "INSERT INTO propuesta(id_lead,monto_total,moneda,estado) VALUES($1,$2,'PEN',$3) RETURNING id_propuesta",
      [lead.id_lead, total, state],
    );
    return (
      await db.query(
        'INSERT INTO contrato(id_lead,id_propuesta) VALUES($1,$2) RETURNING id_contrato',
        [lead.id_lead, p.id_propuesta],
      )
    )[0].id_contrato;
  }
  const legacy = await contract('100.00');
  const [old] = await db.query(
    "INSERT INTO cronograma_pago(id_contrato,monto_programado,cobros_previos,moneda,id_usuario) VALUES($1,100,0,'PEN',$2) RETURNING id_cronograma",
    [legacy, admin.id_usuario],
  );
  const [oldQuota] = await db.query(
    "INSERT INTO cuota_pago(id_cronograma,nro_cuota,monto,fecha_vencimiento) VALUES($1,1,100,'2026-01-01') RETURNING id_cuota",
    [old.id_cronograma],
  );
  await db.query(
    "INSERT INTO pago(id_contrato,id_lead,id_cuota,nro_cuota,monto,moneda,metodo,estado,fecha_pago) VALUES($1,$2,$3,1,10,'PEN','yape','confirmado',now())",
    [legacy, lead.id_lead, oldQuota.id_cuota],
  );
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await new FlexiblePaymentSchedules1792800000000().up(runner);
    await new PaymentActivationGuard1792810000000().up(runner);
    await new PaymentVerification1792900000000().up(runner);
    await new PaymentLegacyChecks1792910000000().up(runner);
    await runner.commitTransaction();
  } catch (e) {
    await runner.rollbackTransaction();
    throw e;
  } finally {
    await runner.release();
  }
  class Root {}
  Module({
    imports: [
      TypeOrmModule.forRoot({ ...options, migrations: [] }),
      AdminModule,
    ],
  })(Root);
  app = await NestFactory.create(Root, { logger: false });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  let cookie = '';
  async function http(
    path,
    method = 'GET',
    body,
    expected = 200,
    headers = {},
  ) {
    const isFixturePayment=cookie && method==='POST' && /^\/admin\/cuotas\/\d+\/abonos$/.test(path);
    const r = isFixturePayment ? await verifiedFixturePayment(db,base,path,body,{Origin:origin,Cookie:cookie,...headers}) : await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: cookie,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await r.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    assert.equal(r.status, expected, `${method} ${path}: ${raw}`);
    return { data, response: r };
  }
  await check('sesión, Origin y consulta pública', async () => {
    await http('/admin/modalidades-pago', 'GET', undefined, 401);
    const login = await http('/auth/login', 'POST', {
      correo: 'r13@example.test',
      password,
    });
    cookie = login.response.headers.get('set-cookie').split(';')[0];
    assert.deepEqual((await http('/public/modalidades-pago')).data, []);
    await http('/admin/modalidades-pago/1', 'PATCH', {}, 403, {
      Origin: 'https://other.test',
    });
  });
  const modes = (await http('/admin/modalidades-pago')).data;
  async function mode(id, change = {}) {
    const current = (await http('/admin/modalidades-pago')).data.find(
      (m) => m.idModalidad === id,
    );
    const { idModalidad, ...body } = current;
    await http(`/admin/modalidades-pago/${id}`, 'PATCH', {
      ...body,
      activa: true,
      ...change,
    });
  }
  await mode(1, { reglaActivacion: null });
  await mode(2, { reglaActivacion: 'primer_abono' });
  await mode(4, { reglaActivacion: 'primera_cuota' });
  const rows = (amounts, first = '2026-01-10') =>
    amounts.map((monto, i) => ({
      nroCuota: i + 1,
      monto,
      fechaVencimiento: `2026-${String(i + 1).padStart(2, '0')}-10`,
      entregables:
        i === 0 ? [{ texto: 'Inicio del servicio', origen: 'adicional' }] : [],
    }));
  async function detail(id) {
    return (await http(`/admin/contratos/${id}/cronograma`)).data;
  }
  async function save(
    id,
    amounts,
    modeId = 2,
    reason = 'Distribución acordada',
  ) {
    const d = await detail(id);
    return (
      await http(
        `/admin/contratos/${id}/cronograma`,
        'POST',
        {
          revision: d.perfilPagos.revision,
          idModalidad: modeId,
          cuotas: rows(amounts),
          motivo: reason,
        },
        201,
      )
    ).data;
  }
  async function action(id, v, accion, motivo = '') {
    const d = await detail(id);
    return (
      await http(
        `/admin/contratos/${id}/cronograma/versiones/${v}/acciones`,
        'POST',
        { revision: d.perfilPagos.revision, accion, motivo },
        201,
      )
    ).data;
  }
  async function approve(
    id,
    v,
    reason = 'Distribución revisada explícitamente',
  ) {
    await action(id, v, 'solicitar');
    await action(id, v, 'aprobar', reason);
  }
  const payment = (monto, key = randomUUID()) => ({
    monto,
    metodo: 'yape',
    fechaPago: new Date(Date.now() - 10000).toISOString(),
    claveIdempotencia: key,
  });
  await check(
    'migración conserva cuota, abono y vencimiento históricos',
    async () => {
      const d = await detail(legacy);
      assert.equal(d.cuotas[0].idCuota, oldQuota.id_cuota);
      assert.equal(d.cuotas[0].saldo, '90.00');
      assert.equal(d.cuotas[0].vencida, true);
      assert.equal(d.perfilPagos.versiones[0].historico, true);
    },
  );
  const id = await contract();
  let v, quota, pay;
  await check(
    'aceptación: 500+1000+1000, aprobación explícita y recarga',
    async () => {
      v = await save(id, ['500.00', '1000.00', '1000.00']);
      let d = await detail(id);
      assert.equal(d.cuotas.length, 0);
      assert.equal(d.perfilPagos.versiones[0].estado, 'borrador');
      const q = d.perfilPagos.versiones[0].cuotas[0].id_cuota;
      await http(`/admin/cuotas/${q}/abonos`, 'POST', payment('1.00'), 409);
      await approve(id, v.idVersion);
      d = await detail(id);
      assert.equal(d.cuotas.length, 3);
      assert.equal(d.perfilPagos.versiones[0].estado, 'negociado');
      assert.equal(d.cuotas[0].vencida, false);
      quota = d.cuotas[0].idCuota;
    },
  );
  await check(
    'sumas erróneas, moneda y propuesta no aceptada se rechazan',
    async () => {
      const d = await detail(id);
      await http(
        `/admin/contratos/${id}/cronograma`,
        'PATCH',
        {
          revision: d.perfilPagos.revision,
          idModalidad: 2,
          cuotas: rows(['1.00']),
          motivo: 'Cambio',
        },
        400,
      );
      const rejected = await contract('100.00', 'borrador');
      await http(
        `/admin/contratos/${rejected}/cronograma/preview`,
        'POST',
        { cantidad: 1, primerVencimiento: '2026-11-10' },
        400,
      );
      await assert.rejects(
        db.query(
          "INSERT INTO pago(id_contrato,id_lead,id_cuota,monto,moneda,metodo,estado,fecha_pago) VALUES($1,$2,$3,1,'USD','yape','confirmado',now())",
          [id, lead.id_lead, quota],
        ),
      );
    },
  );
  await check(
    'concurrencia de abonos, idempotencia y activación en la transacción',
    async () => {
      pay = payment('100.00');
      const results = await Promise.all([
        http(`/admin/cuotas/${quota}/abonos`, 'POST', pay, 201),
        http(`/admin/cuotas/${quota}/abonos`, 'POST', pay, 201),
      ]);
      assert.equal(results[0].data.idPago, results[1].data.idPago);
      const d = await detail(id);
      assert.equal(d.cuotas[0].abonado, '100.00');
      assert.equal(d.perfilPagos.versiones[0].estado, 'en_ejecucion');
      assert.equal(d.cuotas[0].vencida, true);
      assert.equal(
        d.perfilPagos.eventos.filter((e) => e.tipo === 'en_ejecucion').length,
        1,
      );
      await http(
        `/admin/cuotas/${quota}/abonos`,
        'POST',
        { ...pay, monto: '101.00' },
        409,
      );
      await http(
        `/admin/cuotas/${quota}/abonos`,
        'POST',
        payment('401.00'),
        409,
      );
    },
  );
  await check('entregables independientes con autor y fecha', async () => {
    await http(`/admin/cuotas/${quota}/entregables/0`, 'PATCH', {
      estado: 'entregado',
    });
    const d = await detail(id);
    assert.equal(
      d.perfilPagos.versiones[0].cuotas[0].avances[0].estado,
      'entregado',
    );
    assert.equal(d.cuotas[0].saldo, '400.00');
  });
  await check(
    'revisión obsoleta y pago entre borrador y aprobación',
    async () => {
      const newV = await save(id, ['2400.00'], 2, 'Renegociación');
      await action(id, newV.idVersion, 'solicitar');
      await http(
        `/admin/cuotas/${quota}/abonos`,
        'POST',
        payment('100.00'),
        201,
      );
      const d = await detail(id);
      await http(
        `/admin/contratos/${id}/cronograma/versiones/${newV.idVersion}/acciones`,
        'POST',
        {
          revision: d.perfilPagos.revision,
          accion: 'aprobar',
          motivo: 'Revisión',
        },
        409,
      );
      await http(
        `/admin/contratos/${id}/cronograma`,
        'POST',
        {
          revision: 0,
          idModalidad: 2,
          cuotas: rows(['2300.00']),
          motivo: 'Cambio',
        },
        409,
      );
    },
  );
  await check(
    'renegociación conserva pagos y excluye deuda sustituida',
    async () => {
      const nv = await save(
        id,
        ['1000.00', '1300.00'],
        4,
        'Redistribuir saldo',
      );
      await approve(id, nv.idVersion, 'Aprobación propia explícita');
      const d = await detail(id);
      assert.equal(d.cuotas.length, 2);
      assert.equal(d.perfilPagos.versiones[0].cobros_reconocidos, '200.00');
      assert.equal(d.contrato.saldo, '2300.00');
      assert.equal(
        d.perfilPagos.versiones.find((x) => x.id_version === v.idVersion)
          .cuotas[0].abonado,
        '200.00',
      );
      await http(`/admin/cuotas/${quota}/abonos`, 'POST', payment('1.00'), 409);
      // An idempotent replay remains valid even after the original version was superseded.
      await http(`/admin/cuotas/${quota}/abonos`, 'POST', pay, 201);
      quota = d.cuotas[0].idCuota;
      await http(
        `/admin/cuotas/${quota}/abonos`,
        'POST',
        payment('999.00'),
        201,
      );
      assert.equal(
        (await detail(id)).perfilPagos.versiones[0].estado,
        'negociado',
      );
      await http(`/admin/cuotas/${quota}/abonos`, 'POST', payment('1.00'), 201);
      assert.equal(
        (await detail(id)).perfilPagos.versiones[0].estado,
        'en_ejecucion',
      );
      await http(
        `/admin/cuotas/${d.cuotas[1].idCuota}/abonos`,
        'POST',
        payment('1300.00'),
        201,
      );
      assert.equal(
        (await detail(id)).perfilPagos.versiones[0].estado,
        'completado',
      );
      const summary = (await http('/admin/resumen')).data;
      assert.ok(summary.monedas.some((m) => m.moneda === 'PEN'));
    },
  );
  await check(
    'regla sin configurar, cambios de catálogo y aprobación propia',
    async () => {
      const k = await contract('100.00');
      const draft = await save(k, ['100.00'], 1);
      await approve(k, draft.idVersion);
      const d = await detail(k);
      await http(
        `/admin/cuotas/${d.cuotas[0].idCuota}/abonos`,
        'POST',
        payment('1.00'),
        201,
      );
      assert.equal(
        (await detail(k)).perfilPagos.versiones[0].estado,
        'negociado',
      );
      await mode(1, { reglaActivacion: 'primer_abono' });
      assert.equal(
        (await detail(k)).perfilPagos.versiones[0].modalidad.reglaActivacion,
        null,
      );
      const replacement = await save(k, ['99.00'], 1, 'Definir activación');
      await approve(k, replacement.idVersion, 'Regla validada');
      assert.equal(
        (await detail(k)).perfilPagos.versiones[0].estado,
        'en_ejecucion',
      );
    },
  );
  await check('configuración por fases y redondeo en centavos', async () => {
    await mode(3, {
      tipo: 'fases',
      cantidad: 3,
      fases: [
        { nombre: 'Inicio', porcentaje: 2000, dias: 0 },
        { nombre: 'Fase', porcentaje: 4000, dias: 30 },
        { nombre: 'Final', porcentaje: 4000, dias: 60 },
      ],
    });
    const k = await contract('100.01');
    const r = (
      await http(
        `/admin/contratos/${k}/cronograma/preview`,
        'POST',
        { idModalidad: 3, cantidad: 3, primerVencimiento: '2026-01-31' },
        201,
      )
    ).data;
    assert.deepEqual(
      r.cuotas.map((x) => x.monto),
      ['20.00', '40.00', '40.01'],
    );
    await mode(2, { cantidad: 3 });
    const monthly = (
      await http(
        `/admin/contratos/${k}/cronograma/preview`,
        'POST',
        { idModalidad: 2, cantidad: 3, primerVencimiento: '2026-01-31' },
        201,
      )
    ).data;
    assert.equal(monthly.cuotas[1].fechaVencimiento, '2026-02-28');
  });
  await check(
    'pagar otra cuota no activa la regla de primera cuota completa',
    async () => {
      const k = await contract('100.00');
      const draft = await save(
        k,
        ['30.00', '70.00'],
        4,
        'Distribución personalizada',
      );
      await approve(k, draft.idVersion);
      const d = await detail(k);
      await http(
        `/admin/cuotas/${d.cuotas[1].idCuota}/abonos`,
        'POST',
        payment('50.00'),
        201,
      );
      assert.equal(
        (await detail(k)).perfilPagos.versiones[0].estado,
        'negociado',
      );
      await http(
        `/admin/cuotas/${d.cuotas[0].idCuota}/abonos`,
        'POST',
        payment('30.00'),
        201,
      );
      assert.equal(
        (await detail(k)).perfilPagos.versiones[0].estado,
        'en_ejecucion',
      );
    },
  );
  await check(
    'propuesta R8 aceptada conserva versión y entregables de origen',
    async () => {
      const [p] = await db.query(
        "INSERT INTO propuesta(id_lead,monto_total,moneda,estado) VALUES($1,100,'PEN','aceptada') RETURNING id_propuesta",
        [lead.id_lead],
      );
      await db.query(
        "INSERT INTO r8_propuesta(id_propuesta,version_actual,estado) VALUES($1,1,'aceptada')",
        [p.id_propuesta],
      );
      await db.query(
        'INSERT INTO r8_propuesta_version(id_propuesta,version,contenido,id_autor) VALUES($1,1,$2::jsonb,$3)',
        [
          p.id_propuesta,
          JSON.stringify({ lineas: [{ entregables: ['Entrega acordada'] }] }),
          admin.id_usuario,
        ],
      );
      const c = (
        await http(
          '/admin/contratos',
          'POST',
          {
            idLead: lead.id_lead,
            idPropuestaR8: p.id_propuesta,
            fechaFirma: new Date().toISOString(),
            versionClausulas: '1.0',
            aceptaAutoriaEstudiante: true,
          },
          201,
        )
      ).data;
      const body = {
        revision: 0,
        idModalidad: 1,
        cuotas: [
          {
            nroCuota: 1,
            monto: '100.00',
            fechaVencimiento: '2026-11-10',
            entregables: [{ texto: 'Inventado', origen: 'propuesta' }],
          },
        ],
      };
      await http(
        `/admin/contratos/${c.idContrato}/cronograma`,
        'POST',
        body,
        400,
      );
      body.cuotas[0].entregables[0].texto = 'Entrega acordada';
      const v = (
        await http(
          `/admin/contratos/${c.idContrato}/cronograma`,
          'POST',
          body,
          201,
        )
      ).data;
      await approve(c.idContrato, v.idVersion);
      const saved = (await detail(c.idContrato)).perfilPagos;
      assert.equal(saved.versiones[0].version_r8, 1);
      assert.deepEqual(saved.entregablesPropuesta, ['Entrega acordada']);
    },
  );
  await check(
    'configuración inválida y modalidades inactivas se rechazan',
    async () => {
      const list = (await http('/admin/modalidades-pago')).data;
      const { idModalidad, ...m } = list.find((x) => x.tipo === 'fases');
      await http(
        `/admin/modalidades-pago/${idModalidad}`,
        'PATCH',
        { ...m, fases: [{ nombre: 'Inválida', porcentaje: 100, dias: 0 }] },
        400,
      );
      await mode(3, { activa: false });
      const k = await contract('50.00');
      await http(
        `/admin/contratos/${k}/cronograma/preview`,
        'POST',
        { idModalidad: 3, cantidad: 3, primerVencimiento: '2026-11-10' },
        400,
      );
    },
  );
  await check(
    'restricciones SQL: suma diferida e instantáneas inmutables',
    async () => {
      await assert.rejects(
        db.query('UPDATE cuota_pago SET monto=monto+1 WHERE id_cuota=$1', [
          quota,
        ]),
      );
      await assert.rejects(
        db.transaction(async (m) => {
          const [root] = await m.query(
            'SELECT * FROM cronograma_pago WHERE id_contrato=$1',
            [id],
          );
          await m.query(
            "INSERT INTO cronograma_version(id_cronograma,numero,id_propuesta,moneda,total_acordado,cobros_reconocidos,monto_programado,modalidad,id_autor) SELECT id_cronograma,999,id_propuesta,'PEN',2500,200,2300,'{}',$2 FROM cronograma_version WHERE id_version=$1",
            [root.id_version_actual, admin.id_usuario],
          );
        }),
      );
    },
  );
  if (process.argv.includes('--browser')) {
    await check(
      'navegador de desarrollo: configurar, guardar, aprobar y recargar',
      async () => {
        const require = createRequire(
          new URL('../../tesispro-landing/package.json', import.meta.url),
        );
        const { chromium } = require('@playwright/test');
        browser = await chromium.launch({
          headless: true,
          ...(process.env.R13_BROWSER_CHANNEL
            ? { channel: process.env.R13_BROWSER_CHANNEL }
            : {}),
        });
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.route('**/api/**', async (route) => {
          const req = route.request();
          if (!/\/api\/(admin|auth)\//.test(req.url())) return route.continue();
          const url =
            base +
            new URL(req.url()).pathname.replace(/^\/api/, '') +
            new URL(req.url()).search;
          await route.fulfill({
            response: await route.fetch({
              url,
              headers: { ...req.headers(), origin },
            }),
          });
        });
        await page.context().addCookies([
          {
            name: 'tesispro_session',
            value: cookie.split('=')[1],
            url: origin,
          },
        ]);
        const k = await contract();
        await page.goto(
          `${origin}/admin/pagos?contrato=${k}&abrirCronograma=1`,
        );
        await page
          .getByText('Nuevo borrador · Saldo a distribuir:', { exact: false })
          .waitFor();
        await page.getByLabel('Modalidad autorizada').selectOption('2');
        await page
          .getByRole('button', { name: 'Generar distribución' })
          .click();
        await page.getByLabel('Monto cuota 1', { exact: true }).fill('500.00');
        await page.getByLabel('Monto cuota 2', { exact: true }).fill('1000.00');
        await page.getByLabel('Monto cuota 3', { exact: true }).fill('1000.00');
        await page
          .getByLabel('Motivo de ajustes y condiciones especiales')
          .fill('Distribucion acordada');
        await page
          .getByRole('button', { name: 'Guardar borrador del cronograma' })
          .click();
        await page
          .getByRole('button', { name: 'Solicitar aprobación' })
          .click();
        await page
          .getByRole('button', { name: 'Aprobar explícitamente esta versión' })
          .waitFor();
        await page
          .getByLabel('Motivo de aprobación excepcional / renegociación')
          .fill('Distribución revisada');
        await Promise.all([
          page.waitForResponse(
            (r) =>
              r.url().endsWith('/acciones') &&
              r.request().method() === 'POST' &&
              r.request().postDataJSON()?.accion === 'aprobar' &&
              r.status() === 201,
          ),
          page
            .getByRole('button', {
              name: 'Aprobar explícitamente esta versión',
            })
            .click(),
        ]);
        await page.reload();
        // Filters remove the one-time dialog opening flag from the URL.
        await page.goto(
          `${origin}/admin/pagos?contrato=${k}&abrirCronograma=1`,
        );
        await page.getByRole('heading', { name: /Versión 1/ }).waitFor();
        const heading = await page
          .getByRole('heading', { name: /Versión 1/ })
          .innerText();
        assert.match(heading, /Negociado/);
        assert.match(heading, /Vigente/);
        assert.deepEqual(errors, []);
        await page.screenshot({
          path: '.temp/r13-browser.png',
          fullPage: true,
        });
      },
    );
  }
  console.log(`${passed} comprobaciones R13 superadas.`);
} finally {
  await browser?.close();
  await app?.close();
  await db?.destroy();
  if (control.isInitialized) {
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.destroy();
  }
}
