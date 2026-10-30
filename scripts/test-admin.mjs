// Integration tests run only inside a newly created, isolated schema and remove it afterwards.
import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { entities } from '../dist/entities/index.js';
import { AdminModule } from '../dist/modules/admin/admin.module.js';
import { passwordHash, passwordMatches } from '../dist/modules/admin/auth.js';
import { monthlySchedule } from '../dist/modules/admin/money.js';
import { InitialSchema1791855075011 } from '../dist/migrations/1791855075011-InitialSchema.js';
import { AdminPanel1791900000000 } from '../dist/migrations/1791900000000-AdminPanel.js';
import { LeadsModule } from '../dist/modules/leads/leads.module.js';
import { AppController } from '../dist/app.controller.js';
import { AppService } from '../dist/app.service.js';

const schema = `admin_test_${randomBytes(8).toString('hex')}`;
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
  passed = 0;
const origin = 'http://localhost:4321';
process.env.APP_ORIGIN = origin;
async function check(label, fn) {
  await fn();
  passed++;
  console.log(`OK ${label}`);
}
try {
  await control.initialize();
  await control.query(`CREATE SCHEMA ${schema}`);
  const options = {
    ...connection,
    schema,
    entities,
    extra: { options: `-c search_path=${schema}` },
    migrations: [InitialSchema1791855075011, AdminPanel1791900000000],
    synchronize: false,
  };
  db = new DataSource(options);
  await db.initialize();
  await db.runMigrations();
  await check('Migraciones inicial y administrativa', async () =>
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=$1 AND table_name IN ('pago','cuota_pago','cronograma_pago','sesion_admin')",
          [schema],
        )
      )[0].n,
      4,
    ),
  );
  const password = randomBytes(18).toString('hex');
  const hash = await passwordHash(password);
  await check('Contraseñas scrypt y comparación', async () => {
    assert.equal(await passwordMatches(password, hash), true);
    assert.equal(await passwordMatches('incorrecta', hash), false);
  });
  const [admin] = await db.query(
    "INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('Admin','Prueba','admin@example.test','administrador',$1) RETURNING id_usuario",
    [hash],
  );
  const [sales] = await db.query(
    "INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('Ventas','Prueba','ventas@example.test','asesor_comercial',$1) RETURNING id_usuario",
    [hash],
  );
  class Root {}
  Module({
    imports: [TypeOrmModule.forRoot(options), AdminModule, LeadsModule],
    controllers: [AppController],
    providers: [AppService],
  })(Root);
  app = await NestFactory.create(Root, { logger: false });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  let cookie = '';
  async function http(path, method = 'GET', body, custom = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...custom,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, res };
  }
  async function expect(path, method, body, status = 200, custom) {
    const r = await http(path, method, body, custom);
    assert.equal(r.status, status, `${path}: ${JSON.stringify(r.data)}`);
    return r;
  }
  await check('Acceso no autenticado rechazado', () =>
    expect('/admin/leads', 'GET', undefined, 401),
  );
  await check('Origen ajeno y login inválido rechazados', async () => {
    await expect(
      '/auth/login',
      'POST',
      { correo: 'admin@example.test', password },
      403,
      { Origin: 'https://ajeno.example' },
    );
    await expect(
      '/auth/login',
      'POST',
      { correo: 'admin@example.test', password: 'incorrecta' },
      401,
    );
    await expect(
      '/auth/login',
      'POST',
      { correo: 'ventas@example.test', password },
      401,
    );
  });
  await check('Login administrador y cookie HttpOnly', async () => {
    const r = await expect('/auth/login', 'POST', {
      correo: 'admin@example.test',
      password,
    });
    const set = r.res.headers.get('set-cookie');
    assert.match(set, /HttpOnly/);
    assert.match(set, /SameSite=Strict/i);
    cookie = set.split(';')[0];
  });
  await expect('/auth/me', 'GET');
  const catalogs = (await expect('/admin/catalogos', 'GET')).data;
  const initial = catalogs.estados.find((e) => e.codigo !== 'payer').idEstado;
  const state2 = catalogs.estados.find(
    (e) => e.idEstado !== initial && e.codigo !== 'payer',
  ).idEstado;
  const leadData = {
    nombres: 'María Prueba',
    apellidos: 'López',
    correo: 'maria@example.test',
    telefono: '999111222',
    idEstado: initial,
    idResponsable: sales.id_usuario,
    canalPreferido: 'whatsapp',
  };
  let lead;
  await check('Crear lead con historial único y administrador', async () => {
    lead = (await expect('/admin/leads', 'POST', leadData, 201)).data;
    const h = (await expect(`/admin/leads/${lead.idLead}/historial`, 'GET'))
      .data;
    assert.equal(h.length, 1);
    assert.equal(h[0].idUsuario, admin.id_usuario);
  });
  await check(
    'Validación, duplicados y rutas heredadas protegidas',
    async () => {
      await expect(
        '/admin/leads',
        'POST',
        { ...leadData, correo: 'invalid' },
        400,
      );
      await expect(
        '/admin/leads',
        'POST',
        { ...leadData, extra: 'intruso' },
        400,
      );
      await expect('/admin/leads', 'POST', leadData, 409);
      await expect(
        `/lead/${lead.idLead}`,
        'PATCH',
        { nombres: 'intruso' },
        403,
      );
      await expect(`/admin/leads/${lead.idLead}`, 'PATCH', leadData, 403, {
        Origin: 'https://ajeno.example',
      });
    },
  );
  await check(
    'Cambiar estado exige motivo y no duplica historial',
    async () => {
      await expect(
        `/admin/leads/${lead.idLead}`,
        'PATCH',
        { ...leadData, idEstado: state2 },
        400,
      );
      await expect(`/admin/leads/${lead.idLead}`, 'PATCH', {
        ...leadData,
        idEstado: state2,
        motivo: 'Contacto realizado',
      });
      await expect(`/admin/leads/${lead.idLead}`, 'PATCH', {
        ...leadData,
        idEstado: state2,
      });
      const h = (await expect(`/admin/leads/${lead.idLead}/historial`, 'GET'))
        .data;
      assert.equal(h.length, 2);
      assert.equal(h[0].motivo, 'Contacto realizado');
    },
  );
  await check('Filtros combinados, paginación y rango de fechas', async () => {
    const r = (
      await expect(
        `/admin/leads?q=maria&estado=${state2}&responsable=${sales.id_usuario}&canal=whatsapp&pageSize=1`,
        'GET',
      )
    ).data;
    assert.equal(r.total, 1);
    assert.equal(r.items.length, 1);
    await expect(
      '/admin/leads?desde=2026-10-10&hasta=2026-01-01',
      'GET',
      undefined,
      400,
    );
    await expect('/admin/leads?pageSize=1000', 'GET', undefined, 400);
    assert.equal(
      (await expect(`/admin/leads/${lead.idLead}`, 'GET')).data.perfilAcademico,
      null,
    );
  });
  const [proposal] = await db.query(
    "INSERT INTO propuesta(id_lead,monto_total,moneda,estado) VALUES($1,100,'PEN','aceptada') RETURNING id_propuesta",
    [lead.idLead],
  );
  const [contract] = await db.query(
    'INSERT INTO contrato(id_lead,id_propuesta) VALUES($1,$2) RETURNING id_contrato',
    [lead.idLead, proposal.id_propuesta],
  );
  const id = contract.id_contrato;
  let cuotas;
  await check('Preview: centavos y fin de mes', async () => {
    const r = await expect(
      `/admin/contratos/${id}/cronograma/preview`,
      'POST',
      { cantidad: 3, primerVencimiento: '2026-01-31' },
      201,
    );
    cuotas = r.data.cuotas;
    assert.deepEqual(
      cuotas.map((c) => c.monto),
      ['33.33', '33.33', '33.34'],
    );
    assert.deepEqual(
      cuotas.map((c) => c.fechaVencimiento),
      ['2026-01-31', '2026-02-28', '2026-03-31'],
    );
    assert.equal(
      monthlySchedule('1.00', 1, '2028-02-29')[0].fechaVencimiento,
      '2028-02-29',
    );
  });
  await check('Totales incorrectos y duplicados rechazados', async () => {
    await expect(
      `/admin/contratos/${id}/cronograma`,
      'POST',
      { cuotas: [{ ...cuotas[0], monto: '90.00' }] },
      400,
    );
    await expect(`/admin/contratos/${id}/cronograma`, 'POST', { cuotas }, 201);
    await expect(`/admin/contratos/${id}/cronograma`, 'POST', { cuotas }, 409);
  });
  let schedule = (await expect(`/admin/contratos/${id}/cronograma`, 'GET'))
    .data;
  const cuota = schedule.cuotas[0];
  const abono = {
    monto: '10.00',
    metodo: 'yape',
    fechaPago: '2026-01-01T10:00:00-05:00',
    claveIdempotencia: randomUUID(),
  };
  await check('Abonos requieren fecha con zona horaria', async () => {
    await expect(
      `/admin/cuotas/${cuota.idCuota}/abonos`,
      'POST',
      { ...abono, fechaPago: '2026-01-01T10:00:00' },
      400,
    );
  });
  await check(
    'Abono parcial, conversión a cliente y reintento idempotente',
    async () => {
      const a = (
        await expect(
          `/admin/cuotas/${cuota.idCuota}/abonos`,
          'POST',
          abono,
          201,
        )
      ).data;
      const b = (
        await expect(
          `/admin/cuotas/${cuota.idCuota}/abonos`,
          'POST',
          abono,
          201,
        )
      ).data;
      assert.equal(a.idPago, b.idPago);
      await expect(
        `/admin/cuotas/${cuota.idCuota}/abonos`,
        'POST',
        { ...abono, monto: '9.00' },
        409,
      );
      const r = (await expect(`/admin/cuotas/${cuota.idCuota}/abonos`, 'GET'))
        .data;
      assert.equal(r.cuota.estado, 'parcial');
      assert.equal(r.cuota.saldo, '23.33');
      assert.equal(r.items.length, 1);
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM cliente WHERE id_lead=$1',
            [lead.idLead],
          )
        )[0].n,
        1,
      );
    },
  );
  await check(
    'Edición de montos cobrados bloqueada; fechas editables',
    async () => {
      await expect(
        `/admin/contratos/${id}/cronograma`,
        'PATCH',
        {
          cuotas: cuotas.map((c, i) => ({
            ...c,
            monto: i === 0 ? '30.00' : i === 1 ? '36.66' : c.monto,
          })),
        },
        400,
      );
      await expect(`/admin/contratos/${id}/cronograma`, 'PATCH', {
        cuotas: cuotas.map((c, i) => ({
          ...c,
          fechaVencimiento: i === 0 ? '2026-01-30' : c.fechaVencimiento,
        })),
      });
    },
  );
  await check('Sobrepago rechazado y concurrencia segura', async () => {
    await expect(
      `/admin/cuotas/${cuota.idCuota}/abonos`,
      'POST',
      { ...abono, monto: '24.00', claveIdempotencia: randomUUID() },
      400,
    );
    const results = await Promise.all(
      [1, 2].map(() =>
        http(`/admin/cuotas/${cuota.idCuota}/abonos`, 'POST', {
          ...abono,
          monto: '20.00',
          claveIdempotencia: randomUUID(),
        }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]);
    await expect(
      `/admin/cuotas/${cuota.idCuota}/abonos`,
      'POST',
      { ...abono, monto: '3.33', claveIdempotencia: randomUUID() },
      201,
    );
    const r = (await expect(`/admin/cuotas/${cuota.idCuota}/abonos`, 'GET'))
      .data;
    assert.equal(r.cuota.estado, 'pagada');
    assert.equal(r.cuota.saldo, '0.00');
  });
  await check('Filtros de cuotas y resumen por moneda', async () => {
    const r = (
      await expect(
        `/admin/cuotas?estado=pagada&contrato=${id}&moneda=PEN`,
        'GET',
      )
    ).data;
    assert.equal(r.total, 1);
    const overview = (await expect('/admin/resumen', 'GET')).data;
    assert.equal(overview.leads.total, 1);
    assert.equal(overview.monedas[0].cobrado, '33.33');
    await expect('/admin/contratos?q=maria', 'GET');
  });
  await check('Cobros previos y pagos pendientes', async () => {
    const [p] = await db.query(
      'INSERT INTO propuesta(id_lead,monto_total) VALUES($1,200) RETURNING id_propuesta',
      [lead.idLead],
    );
    const [c] = await db.query(
      'INSERT INTO contrato(id_lead,id_propuesta) VALUES($1,$2) RETURNING id_contrato',
      [lead.idLead, p.id_propuesta],
    );
    await db.query(
      "INSERT INTO pago(id_contrato,id_lead,monto,moneda,metodo,estado) VALUES($1,$2,50,'PEN','efectivo','confirmado')",
      [c.id_contrato, lead.idLead],
    );
    const [pending] = await db.query(
      "INSERT INTO pago(id_contrato,id_lead,monto,moneda,metodo,estado) VALUES($1,$2,20,'PEN','yape','pendiente') RETURNING id_pago",
      [c.id_contrato, lead.idLead],
    );
    await expect(
      `/admin/contratos/${c.id_contrato}/cronograma/preview`,
      'POST',
      { cantidad: 2, primerVencimiento: '2026-11-01' },
      400,
    );
    await expect(`/admin/pagos-previos/${pending.id_pago}`, 'PATCH', {
      estado: 'rechazado',
    });
    const r = (
      await expect(
        `/admin/contratos/${c.id_contrato}/cronograma/preview`,
        'POST',
        { cantidad: 2, primerVencimiento: '2026-11-01' },
        201,
      )
    ).data;
    assert.deepEqual(
      r.cuotas.map((c) => c.monto),
      ['75.00', '75.00'],
    );
    await expect(
      `/admin/contratos/${c.id_contrato}/cronograma`,
      'POST',
      r,
      201,
    );
    assert.equal(
      (await expect(`/admin/contratos/${c.id_contrato}/cronograma`, 'GET')).data
        .cronograma.cobrosPrevios,
      '50.00',
    );
  });
  await check('Logout y sesión caducada', async () => {
    await db.query(
      "UPDATE sesion_admin SET expires_at=now()-interval '1 minute'",
    );
    await expect('/auth/me', 'GET', undefined, 401);
    const r = await expect('/auth/login', 'POST', {
      correo: 'admin@example.test',
      password,
    });
    cookie = r.res.headers.get('set-cookie').split(';')[0];
    await expect('/auth/logout', 'POST');
    await expect('/auth/me', 'GET', undefined, 401);
  });
  await app.close();
  app = null;
  await check('Reversión de migración administrativa', async () => {
    await db.undoLastMigration();
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=$1 AND table_name='cuota_pago'",
          [schema],
        )
      )[0].n,
      0,
    );
    assert.equal(
      (await db.query('SELECT count(*)::int AS n FROM pago'))[0].n,
      5,
    );
  });
  console.log(`${passed} comprobaciones de integración completadas.`);
} finally {
  if (app) await app.close();
  if (db?.isInitialized) await db.destroy();
  // schema is generated above, never taken from env or user input.
  if (control.isInitialized) {
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.destroy();
  }
}
