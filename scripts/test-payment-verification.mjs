import { PaymentLegacyChecks1792910000000 } from '../dist/migrations/1792910000000-PaymentLegacyChecks.js';
import { SuperAdminPayments1793000000000 } from '../dist/migrations/1793000000000-SuperAdminPayments.js';
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readdir, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { entities } from '../dist/entities/index.js';
import { AdminModule } from '../dist/modules/admin/admin.module.js';
import { passwordHash } from '../dist/modules/admin/auth.js';
import { PaymentVerification1792900000000 } from '../dist/migrations/1792900000000-PaymentVerification.js';
const schema = `verification_test_${randomBytes(8).toString('hex')}`;
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
const cookies = {};
const check = async (name, fn) => {
  await fn();
  console.log(`OK ${++passed} ${name}`);
};
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
        !f.includes('1792900000000') &&
        !f.includes('1792910000000') && !f.includes('1793000000000'),
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
  const users = {};
  for (const [name, role] of [
    ['admin', 'administrador'],
    ['sales', 'asesor_comercial'],
    ['other', 'investigador'],
  ])
    users[name] = (
      await db.query(
        "INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES($1,'Prueba',$2,$3,$4) RETURNING id_usuario",
        [name, `${name}@r14.test`, role, await passwordHash(password)],
      )
    )[0].id_usuario;
  async function contract(total = '500.00') {
    const [l] = await db.query(
      "INSERT INTO lead(nombres,correo,id_estado) SELECT 'Cliente R14',$1,id_estado FROM estado_lead WHERE codigo='nuevo' RETURNING id_lead",
      [`${randomUUID()}@r14.test`],
    );
    const [p] = await db.query(
      "INSERT INTO propuesta(id_lead,monto_total,moneda,estado) VALUES($1,$2,'PEN','aceptada') RETURNING id_propuesta",
      [l.id_lead, total],
    );
    return {
      ...(
        await db.query(
          'INSERT INTO contrato(id_lead,id_propuesta) VALUES($1,$2) RETURNING *',
          [l.id_lead, p.id_propuesta],
        )
      )[0],
    };
  }
  const historic = await contract('100.00');
  const [legacy] = await db.query(
    "INSERT INTO pago(id_contrato,id_lead,monto,moneda,metodo,estado,fecha_pago) VALUES($1,$2,20,'PEN','efectivo','pendiente',now()) RETURNING id_pago",
    [historic.id_contrato, historic.id_lead],
  );
  const runner = db.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await new PaymentVerification1792900000000().up(runner);
    await new PaymentLegacyChecks1792910000000().up(runner);
    await new SuperAdminPayments1793000000000().up(runner);
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
  async function http(
    path,
    method = 'GET',
    body,
    status = 200,
    role = 'admin',
    extra = {},
  ) {
    const r = await fetch(base + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookies[role] || '',
        ...(!(body instanceof FormData) && body
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...extra,
      },
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
    });
    const raw = await r.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    assert.equal(r.status, status, `${method} ${path}: ${raw}`);
    return { data, r };
  }
  for (const role of ['admin', 'sales']) {
    const { r } = await http(
      '/auth/login',
      'POST',
      { correo: `${role}@r14.test`, password },
      200,
      'none',
    );
    cookies[role] = r.headers.get('set-cookie').split(';')[0];
  }
  const decision = (
    estado = 'confirmado',
    motivo = 'Conciliado con el movimiento bancario',
  ) => ({ estado, motivo, claveIdempotencia: randomUUID() });
  const payment = (monto, reference) => ({
    monto,
    metodo: 'yape',
    fechaPago: new Date(Date.now() - 60000).toISOString(),
    claveIdempotencia: randomUUID(),
    ...(reference ? { referenciaOperacion: reference } : {}),
  });
  async function schedule(c, amounts = ['500.00'], rect) {
    const details = (await http(`/admin/contratos/${c.id_contrato}/cronograma`))
      .data;
    const v = (
      await http(
        `/admin/contratos/${c.id_contrato}/cronograma`,
        'POST',
        {
          revision: details.perfilPagos.revision,
          idModalidad: amounts.length === 1 ? 1 : 4,
          cuotas: amounts.map((monto, i) => ({
            nroCuota: i + 1,
            monto,
            fechaVencimiento: `2026-${String(10 + i).padStart(2, '0')}-10`,
          })),
          motivo: 'Distribución autorizada para la prueba',
          idRectificacion: rect,
        },
        201,
      )
    ).data;
    for (const accion of ['solicitar', 'aprobar']) {
      const d = (await http(`/admin/contratos/${c.id_contrato}/cronograma`))
        .data;
      await http(
        `/admin/contratos/${c.id_contrato}/cronograma/versiones/${v.idVersion}/acciones`,
        'POST',
        {
          accion,
          revision: d.perfilPagos.revision,
          motivo: 'Aprobación explícita de condiciones',
        },
        201,
      );
    }
    return (await http(`/admin/contratos/${c.id_contrato}/cronograma`)).data;
  }
  await db.query(
    "UPDATE modalidad_pago SET activa=true,regla_activacion='primer_abono' WHERE id_modalidad IN (1,4)",
  );
  const c = await contract(),
    s = await schedule(c),
    q = s.cuotas[0].idCuota;
  await check('permisos limitados y separación de roles', async () => {
    await http('/admin/resumen', 'GET', undefined, 403, 'sales');
    await http('/admin/leads', 'GET', undefined, 403, 'sales');
    await http('/admin/pagos/catalogos', 'GET', undefined, 200, 'sales');
    await http('/admin/pagos/titulares', 'GET', undefined, 200);
    await http(
      '/auth/login',
      'POST',
      { correo: 'other@r14.test', password },
      401,
    );
    await http('/admin/pagos', 'GET', undefined, 401, 'none');
    await http(
      `/admin/cuotas/${q}/abonos`,
      'POST',
      payment('1.00'),
      403,
      'sales',
      { Origin: 'https://other.test' },
    );
  });
  let p1, p2;
  await check(
    'aceptación: registrar 200 y 300 no reduce saldo ni convierte cliente',
    async () => {
      p1 = (
        await http(
          `/admin/cuotas/${q}/abonos`,
          'POST',
          payment('200.00'),
          201,
          'sales',
        )
      ).data;
      p2 = (
        await http(
          `/admin/cuotas/${q}/abonos`,
          'POST',
          payment('300.00'),
          201,
          'sales',
        )
      ).data;
      assert.equal(p1.estado, 'pendiente');
      const [{ correo }] = await db.query('SELECT correo FROM lead WHERE id_lead=$1', [c.id_lead]);
      const found = (await http(`/admin/pagos?estado=pendiente&q=${encodeURIComponent(correo)}`)).data;
      assert.equal(found.total, 2);
      assert.ok(found.items.some(p => p.idPago === p1.idPago));
      assert.equal((await http('/admin/pagos?estado=pendiente&q=sin-coincidencia@example.test')).data.total, 0);
      assert.equal(
        (await http(`/admin/contratos/${c.id_contrato}/cronograma`)).data
          .cuotas[0].saldo,
        '500.00',
      );
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int n FROM cliente WHERE id_lead=$1',
            [c.id_lead],
          )
        )[0].n,
        0,
      );
      assert.equal(
        (await http(`/admin/contratos/${c.id_contrato}/cronograma`)).data
          .perfilPagos.versiones[0].estado,
        'negociado',
      );
    },
  );
  await check(
    'aceptación: confirmar 200 deja parcial; confirmar 300 deja pagada',
    async () => {
      const d = decision();
      await http(`/admin/pagos/${p1.idPago}/decision`, 'POST', d, 201);
      let status = (await http(`/admin/contratos/${c.id_contrato}/cronograma`))
        .data;
      assert.equal(status.cuotas[0].saldo, '300.00');
      assert.equal(status.cuotas[0].estado, 'parcial');
      assert.equal(status.perfilPagos.versiones[0].estado, 'en_ejecucion');
      await Promise.all([
        http(`/admin/pagos/${p1.idPago}/decision`, 'POST', d, 201),
        http(`/admin/pagos/${p1.idPago}/decision`, 'POST', d, 201),
      ]);
      await http(
        `/admin/pagos/${p1.idPago}/decision`,
        'POST',
        decision('rechazado'),
        409,
      );
      await http(`/admin/pagos/${p2.idPago}/decision`, 'POST', decision(), 201);
      status = (await http(`/admin/contratos/${c.id_contrato}/cronograma`))
        .data;
      assert.equal(status.cuotas[0].saldo, '0.00');
      assert.equal(status.cuotas[0].estado, 'pagada');
      assert.equal(status.perfilPagos.versiones[0].estado, 'completado');
      const audit = (await http(`/admin/pagos/${p1.idPago}`)).data;
      assert.equal(audit.idUsuarioRegistro, users.sales);
      assert.equal(audit.idVerificador, users.admin);
      assert.equal(
        audit.eventos.filter((e) => e.tipo === 'confirmado').length,
        1,
      );
    },
  );
  const c2 = await contract(),
    q2 = (await schedule(c2)).cuotas[0].idCuota;
  await check('registro idempotente, rechazo e importes exactos', async () => {
    const payload = payment('200.00');
    const a = (
      await http(`/admin/cuotas/${q2}/abonos`, 'POST', payload, 201, 'sales')
    ).data;
    const b = (
      await http(`/admin/cuotas/${q2}/abonos`, 'POST', payload, 201, 'sales')
    ).data;
    assert.equal(a.idPago, b.idPago);
    await http(
      `/admin/cuotas/${q2}/abonos`,
      'POST',
      { ...payload, monto: '201.00' },
      409,
      'sales',
    );
    await http(
      `/admin/pagos/${a.idPago}/decision`,
      'POST',
      decision('rechazado', 'Comprobante no corresponde'),
      201,
    );
    assert.equal(
      (await http(`/admin/contratos/${c2.id_contrato}/cronograma`)).data
        .cuotas[0].saldo,
      '500.00',
    );
    await http(
      `/admin/cuotas/${q2}/abonos`,
      'POST',
      payment('1.001'),
      400,
      'sales',
    );
  });
  await check(
    'excedentes quedan pendientes y conservan la incidencia',
    async () => {
      const p = (
        await http(
          `/admin/cuotas/${q2}/abonos`,
          'POST',
          payment('501.00'),
          201,
          'sales',
        )
      ).data;
      assert.equal(p.excedente, true);
      await http(`/admin/pagos/${p.idPago}/decision`, 'POST', decision(), 409);
      const d = (await http(`/admin/pagos/${p.idPago}`)).data;
      assert.equal(d.estado, 'pendiente');
      assert.ok(d.eventos.some((e) => e.tipo === 'incidencia'));
      await http(
        `/admin/pagos/${p.idPago}/decision`,
        'POST',
        decision('rechazado', 'Requiere conciliación del excedente'),
        201,
      );
    },
  );
  await check('concurrencia de verificación no permite sobrepago', async () => {
    const a = (
        await http(
          `/admin/cuotas/${q2}/abonos`,
          'POST',
          payment('300.00'),
          201,
          'sales',
        )
      ).data,
      b = (
        await http(
          `/admin/cuotas/${q2}/abonos`,
          'POST',
          payment('300.00'),
          201,
          'sales',
        )
      ).data;
    const results = await Promise.all(
      [a, b].map((p) =>
        fetch(base + `/admin/pagos/${p.idPago}/decision`, {
          method: 'POST',
          headers: {
            Origin: origin,
            Cookie: cookies.admin,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(decision()),
        }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.equal(
      (await http(`/admin/contratos/${c2.id_contrato}/cronograma`)).data
        .cuotas[0].saldo,
      '200.00',
    );
    const pending = (
      await http('/admin/pagos?estado=pendiente')
    ).data.items.find((p) => p.idContrato === c2.id_contrato);
    await http(
      `/admin/pagos/${pending.idPago}/decision`,
      'POST',
      decision('rechazado', 'Segundo registro no conciliado'),
      201,
    );
  });
  await check(
    'el administrador puede decidir sobre un registro propio tras cambiar de rol',
    async () => {
      const p = (
        await http(
          `/admin/cuotas/${q2}/abonos`,
          'POST',
          payment('1.00'),
          201,
          'sales',
        )
      ).data;
      await db.query(
        "UPDATE usuario_interno SET rol='administrador' WHERE id_usuario=$1",
        [users.sales],
      );
      await http(
        `/admin/pagos/${p.idPago}/decision`,
        'POST',
        decision('rechazado', 'Revisión por administrador'),
        201,
        'sales',
      );
      await db.query(
        "UPDATE usuario_interno SET rol='asesor_comercial' WHERE id_usuario=$1",
        [users.sales],
      );
    },
  );
  let evidencePayment;
  await check(
    'comprobante privado, validación, reintento y descarga protegida',
    async () => {
      const payload = payment('50.00'),
        pdf = Buffer.from('%PDF-1.4\ncomprobante de prueba');
      const form = () => {
        const f = new FormData();
        Object.entries(payload).forEach(([k, v]) => f.set(k, v));
        f.set(
          'archivo',
          new Blob([pdf], { type: 'application/pdf' }),
          'prueba.pdf',
        );
        return f;
      };
      evidencePayment = (
        await http(`/admin/cuotas/${q2}/abonos`, 'POST', form(), 201, 'sales')
      ).data;
      const replay = (
        await http(`/admin/cuotas/${q2}/abonos`, 'POST', form(), 201, 'sales')
      ).data;
      assert.equal(evidencePayment.idPago, replay.idPago);
      assert.equal(replay.comprobantes.length, 1);
      const file = await fetch(
        base +
          `/admin/pagos/comprobantes/${replay.comprobantes[0].idComprobante}`,
        { headers: { Cookie: cookies.admin } },
      );
      assert.deepEqual(Buffer.from(await file.arrayBuffer()), pdf);
      assert.equal(file.headers.get('cache-control'), 'no-store');
      await http(
        `/admin/pagos/comprobantes/${replay.comprobantes[0].idComprobante}`,
        'GET',
        undefined,
        401,
        'none',
      );
      const invalid = form();
      invalid.set('archivo', new Blob(['script']), 'falso.png');
      await http(`/admin/cuotas/${q2}/abonos`, 'POST', invalid, 400, 'sales');
      const large = form();
      large.set('archivo', new Blob([Buffer.alloc(10485761)]), 'grande.pdf');
      await http(`/admin/cuotas/${q2}/abonos`, 'POST', large, 413, 'sales');
    },
  );
  await check('posible duplicado requiere conciliación explícita', async () => {
    const c3 = await contract(),
      q3 = (await schedule(c3)).cuotas[0].idCuota;
    const ref = 'OP-R14-123';
    const p = (
      await http(
        `/admin/cuotas/${q3}/abonos`,
        'POST',
        payment('100.00', ref),
        201,
        'sales',
      )
    ).data;
    const duplicate = (
      await http(
        `/admin/cuotas/${q3}/abonos`,
        'POST',
        payment('100.00', ref),
        201,
        'sales',
      )
    ).data;
    assert.equal(duplicate.posibleDuplicado, true);
    await http(`/admin/pagos/${p.idPago}/decision`, 'POST', decision(), 409);
    await http(
      `/admin/pagos/${duplicate.idPago}/decision`,
      'POST',
      decision('rechazado', 'Duplicado acreditado'),
      201,
    );
    await http(`/admin/pagos/${p.idPago}/decision`, 'POST', decision(), 201);
  });
  await check(
    'histórico sin autor requiere regularización sin sobrescribir el registro',
    async () => {
      await http(
        `/admin/pagos-previos/${legacy.id_pago}`,
        'PATCH',
        decision(),
        409,
      );
      await http(
        `/admin/pagos/${legacy.id_pago}/regularizacion`,
        'POST',
        { motivo: 'Conciliado por asesor', claveIdempotencia: randomUUID() },
        201,
        'sales',
      );
      await http(
        `/admin/pagos-previos/${legacy.id_pago}`,
        'PATCH',
        decision(),
        200,
      );
      const p = (await http(`/admin/pagos/${legacy.id_pago}`)).data;
      assert.equal(p.idUsuarioRegistro, null);
      assert.equal(p.historico, true);
      assert.equal(p.idVerificador, users.admin);
    },
  );
  await check(
    'rectificación vigente conserva original y reabre cuota completada',
    async () => {
      const r = (
        await http(
          `/admin/pagos/${p2.idPago}/rectificaciones`,
          'POST',
          {
            motivo: 'Importe confirmado incorrectamente',
            claveIdempotencia: randomUUID(),
          },
          201,
          'sales',
        )
      ).data;
      const d = decision();
      await http(
        `/admin/pagos/rectificaciones/${r.idRectificacion}/decision`,
        'POST',
        d,
        201,
      );
      await http(
        `/admin/pagos/rectificaciones/${r.idRectificacion}/decision`,
        'POST',
        d,
        201,
      );
      const status = (
        await http(`/admin/contratos/${c.id_contrato}/cronograma`)
      ).data;
      assert.equal(status.cuotas[0].saldo, '300.00');
      assert.equal(status.perfilPagos.versiones[0].estado, 'en_ejecucion');
      assert.equal(
        (await http(`/admin/pagos/${p2.idPago}`)).data.monto,
        '300.00',
      );
      assert.equal(
        (await http(`/admin/pagos/${p2.idPago}`)).data.aplicado,
        '0.00',
      );
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int n FROM cliente WHERE id_lead=$1',
            [c.id_lead],
          )
        )[0].n,
        1,
      );
      await http(
        `/admin/pagos/${p2.idPago}/rectificaciones`,
        'POST',
        { motivo: 'Otra corrección', claveIdempotencia: randomUUID() },
        409,
        'sales',
      );
    },
  );
  await check(
    'rectificación histórica se aplica junto con nueva versión R13',
    async () => {
      const next = await schedule(c, ['300.00']);
      const r = (
        await http(
          `/admin/pagos/${p1.idPago}/rectificaciones`,
          'POST',
          {
            motivo: 'Rectificar cobro reconocido anterior',
            claveIdempotencia: randomUUID(),
          },
          201,
          'sales',
        )
      ).data;
      await http(
        `/admin/pagos/rectificaciones/${r.idRectificacion}/decision`,
        'POST',
        decision(),
        409,
      );
      const corrected = await schedule(c, ['500.00'], r.idRectificacion);
      assert.equal(corrected.contrato.saldo, '500.00');
      assert.equal(
        corrected.perfilPagos.versiones[0].cobros_reconocidos,
        '0.00',
      );
      assert.equal(corrected.cuotas[0].monto, '500.00');
      assert.equal(
        corrected.perfilPagos.versiones.find(
          (v) => v.id_version === next.perfilPagos.versionActual,
        ).cobros_reconocidos,
        '200.00',
      );
    },
  );
  await check('administrador registra, confirma y rectifica su propio abono con auditoría', async () => {
    const own = await contract();
    const ownSchedule = await schedule(own);
    const ownQuota = ownSchedule.cuotas[0].idCuota;
    const p = (await http(`/admin/cuotas/${ownQuota}/abonos`, 'POST', payment('50.00'), 201)).data;
    assert.equal(p.idUsuarioRegistro, users.admin);
    await http(`/admin/pagos/${p.idPago}/decision`, 'POST', decision(), 201);
    const confirmed = (await http(`/admin/pagos/${p.idPago}`)).data;
    assert.equal(confirmed.estado, 'confirmado');
    assert.equal(confirmed.idVerificador, users.admin);
    const rect = (await http(`/admin/pagos/${p.idPago}/rectificaciones`, 'POST', {
      motivo: 'Corrección por administrador', claveIdempotencia: randomUUID(),
    }, 201)).data;
    await http(`/admin/pagos/rectificaciones/${rect.idRectificacion}/decision`, 'POST', decision(), 201);
    const after = (await http(`/admin/pagos/${p.idPago}`)).data;
    assert.equal(after.aplicado, '0.00');
    assert.ok(after.eventos.some(e => e.tipo === 'registro'));
    assert.ok(after.eventos.some(e => e.tipo === 'confirmado'));
    assert.ok(after.eventos.some(e => e.tipo === 'rectificacion_confirmado'));
  });
  await check(
    'originales, eventos y comprobantes no se editan ni se borran',
    async () => {
      await assert.rejects(
        db.query('UPDATE pago SET monto=1 WHERE id_pago=$1', [p1.idPago]),
      );
      await assert.rejects(
        db.query('DELETE FROM pago WHERE id_pago=$1', [p1.idPago]),
      );
      await assert.rejects(
        db.query('DELETE FROM pago_evento WHERE id_pago=$1', [p1.idPago]),
      );
      await assert.rejects(
        db.query(
          "UPDATE pago_comprobante SET nombre='otro.pdf' WHERE id_pago=$1",
          [evidencePayment.idPago],
        ),
      );
      const pending = (await http('/admin/pagos?estado=pendiente')).data
        .items[0];
      assert.ok(pending);
      await http(
        `/admin/contratos/${pending.idContrato}/cronograma/preview`,
        'POST',
        { cantidad: 1, primerVencimiento: '2026-11-10' },
        409,
      );
      const summary = (await http('/admin/resumen')).data;
      assert.ok(summary.monedas.some((m) => m.moneda === 'PEN'));
    },
  );
  if (process.argv.includes('--browser')) {
    await check(
      'navegador 4321: asesor registra; administrador confirma; recarga conserva saldo',
      async () => {
        const require = createRequire(
          new URL('../../tesispro-landing/package.json', import.meta.url),
        );
        const { chromium } = require('@playwright/test');
        browser = await chromium.launch({
          headless: true,
          channel: process.env.R14_BROWSER_CHANNEL || 'msedge',
        });
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        let role = 'sales';
        await page.route('**/api/**', async (route) => {
          const req = route.request();
          if (!/\/api\/(admin|auth)\//.test(req.url())) return route.continue();
          await route.fulfill({
            response: await route.fetch({
              url:
                base +
                new URL(req.url()).pathname.replace(/^\/api/, '') +
                new URL(req.url()).search,
              headers: { ...req.headers(), origin, Cookie: cookies[role] },
            }),
          });
        });
        const fixture = await contract(),
          scheduled = await schedule(fixture),
          quota = scheduled.cuotas[0].idCuota;
        await page.goto(origin + '/admin/pagos');
        await page
          .getByLabel('Titular del contrato')
          .selectOption(fixture.id_lead);
        await page
          .getByLabel('Contrato', { exact: true })
          .selectOption(String(fixture.id_contrato));
        await page
          .getByLabel('Cuota', { exact: true })
          .selectOption(String(quota));
        await page.getByLabel('Importe del abono').fill('200.00');
        await page
          .getByLabel('Fecha y hora del pago (Lima)')
          .fill('2026-11-01T10:00');
        await page
          .getByLabel('Método de pago', { exact: true })
          .selectOption('yape');
        await Promise.all([
          page.waitForResponse(
            (r) =>
              r.url().includes('/abonos') &&
              r.request().method() === 'POST' &&
              r.status() === 201,
          ),
          page
            .getByRole('button', {
              name: 'Registrar pendiente de verificación',
            })
            .click(),
        ]);
        const [p] = await db.query(
          'SELECT id_pago FROM pago WHERE id_cuota=$1',
          [quota],
        );
        role = 'admin';
        await page.goto(origin + '/admin/pagos');
        await page
          .getByRole('button', {
            name: `Revisar pago #${p.id_pago}`,
            exact: true,
          })
          .click();
        await page
          .getByLabel('Fundamento de la decisión o solicitud')
          .fill('Comprobación bancaria independiente');
        await Promise.all([
          page.waitForResponse(
            (r) => r.url().endsWith('/decision') && r.status() === 201,
          ),
          page
            .getByRole('button', { name: 'Confirmar abono', exact: true })
            .click(),
        ]);
        await page.reload();
        await page.getByLabel('Verificación',{exact:true}).selectOption('confirmado');
        await page.getByRole('button',{name:`Revisar pago #${p.id_pago}`,exact:true}).click();
        await page.getByRole('dialog').getByText(/Confirmado.*Aplicado/).waitFor();
        assert.equal(
          (await http(`/admin/contratos/${fixture.id_contrato}/cronograma`))
            .data.cuotas[0].saldo,
          '300.00',
        );
        assert.deepEqual(errors, []);
        await mkdir('.temp', { recursive: true });
        await page.screenshot({
          path: '.temp/r14-browser.png',
          fullPage: true,
        });
      },
    );
  }
  console.log(`${passed} grupos R14 superados.`);
} finally {
  await browser?.close();
  await app?.close();
  await db?.destroy();
  if (control.isInitialized) {
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.destroy();
  }
}
