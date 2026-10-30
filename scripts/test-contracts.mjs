// HTTP real y PostgreSQL, exclusivamente en un esquema temporal generado por esta prueba.
import 'reflect-metadata';
import { config } from 'dotenv';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
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
config({ quiet: true });
const schema = `contracts_test_${randomBytes(8).toString('hex')}`;
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
    migrations: [
      InitialSchema1791855075011,
      AdminPanel1791900000000,
      ContractServices1792060000000,
    ],
  };
  db = new DataSource(options);
  await db.initialize();
  await db.runMigrations();
  await check(
    'Catálogo inicial, idempotencia y reversión conservadora',
    async () => {
      assert.equal(
        (await db.query('SELECT count(*)::int n FROM servicio'))[0].n,
        3,
      );
      await db.query(
        "UPDATE servicio SET precio_base=123,nombre='Servicio personalizado' WHERE codigo='puntual'",
      );
      const runner = db.createQueryRunner();
      try {
        await new ContractServices1792060000000().up(runner);
        await new ContractServices1792060000000().down(runner);
        assert.equal(
          (await db.query('SELECT count(*)::int n FROM servicio'))[0].n,
          3,
        );
        const [row] = await db.query(
          "SELECT nombre,precio_base FROM servicio WHERE codigo='puntual'",
        );
        assert.equal(row.nombre, 'Servicio personalizado');
        assert.equal(row.precio_base, '123.00');
      } finally {
        await runner.release();
      }
    },
  );
  const password = randomBytes(18).toString('hex');
  await db.query(
    "INSERT INTO usuario_interno(nombres,apellidos,correo,rol,password_hash) VALUES('Admin','Prueba','contracts@example.test','administrador',$1)",
    [await passwordHash(password)],
  );
  class Root {}
  Module({ imports: [TypeOrmModule.forRoot(options), AdminModule] })(Root);
  app = await NestFactory.create(Root, { logger: false });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl(),
    origin = 'http://localhost:4321';
  process.env.APP_ORIGIN = origin;
  let cookie = '';
  async function http(path, method = 'GET', body, extra = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json(), res };
  }
  async function expect(path, method, body, status = 200) {
    const r = await http(path, method, body);
    assert.equal(r.status, status, `${path}: ${JSON.stringify(r.data)}`);
    return r.data;
  }
  await check('CRUD protegido por sesión y origen', async () => {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE'])
      await expect(
        method === 'POST' ? '/admin/contratos' : '/admin/contratos/1',
        method,
        undefined,
        401,
      );
    const login = await http('/auth/login', 'POST', {
      correo: 'contracts@example.test',
      password,
    });
    assert.equal(login.status, 200);
    cookie = login.res.headers.get('set-cookie').split(';')[0];
    assert.equal(
      (
        await http(
          '/admin/contratos',
          'POST',
          {},
          { Origin: 'https://other.test' },
        )
      ).status,
      403,
    );
  });
  const catalogs = await expect('/admin/contratos/catalogos');
  const serviceId = catalogs.servicios[0].idServicio;
  const [{ id_estado: stateId }] = await db.query(
    "SELECT id_estado FROM estado_lead WHERE codigo='nuevo'",
  );
  const lead = await expect(
    '/admin/leads',
    'POST',
    {
      nombres: 'Nora',
      apellidos: 'Prueba',
      correo: 'nora@example.test',
      telefono: '999888777',
      idEstado: stateId,
    },
    201,
  );
  const terms = (amount = '100.00') => ({
    moneda: 'PEN',
    modalidad: 'virtual',
    condiciones: 'Acuerdo de prueba',
    tiempoEntregaDias: 20,
    detalles: [
      {
        idServicio: serviceId,
        descripcion: 'Metodología',
        cantidad: 1,
        precioUnitario: amount,
        descuento: '0.00',
      },
    ],
  });
  const payload = (amount = '100.00') => ({
    idLead: lead.idLead,
    propuesta: terms(amount),
    fechaFirma: '2026-10-15T14:00:00-05:00',
    versionClausulas: '1.0',
    aceptaAutoriaEstudiante: true,
    archivoUrl: null,
  });
  const create = async (body = payload()) =>
    expect('/admin/contratos', 'POST', body, 201);
  let contract;
  await check(
    'Creación integrada, centavos exactos y lead sin conversión',
    async () => {
      const body = payload();
      body.propuesta.detalles[0] = {
        ...body.propuesta.detalles[0],
        cantidad: 3,
        precioUnitario: '33.33',
        descuento: '0.01',
      };
      contract = await create(body);
      assert.equal(contract.montoTotal, '99.98');
      assert.equal(contract.saldo, '99.98');
      assert.equal(contract.idLead, lead.idLead);
      assert.equal(typeof contract.idPropuesta, 'string');
      assert.equal(contract.propuesta.detalles[0].subtotal, '99.98');
      assert.equal(contract.propuesta.estado, 'aceptada');
      assert.ok(contract.propuesta.idUsuario);
      assert.equal(contract.propuesta.idLead, contract.idLead);
      assert.equal(
        (
          await db.query('SELECT id_estado FROM lead WHERE id_lead=$1', [
            lead.idLead,
          ])
        )[0].id_estado,
        stateId,
      );
      assert.equal(
        (await db.query('SELECT count(*)::int n FROM cliente'))[0].n,
        0,
      );
    },
  );
  await check(
    'Validaciones rechazan importes, servicios, lead, autoría y fechas inválidos',
    async () => {
      const count = (await db.query('SELECT count(*)::int n FROM propuesta'))[0]
        .n;
      for (const changes of [
        { idLead: '9223372036854775808' },
        { propuesta: null },
        { aceptaAutoriaEstudiante: false },
        { fechaFirma: '2026-10-15T14:00:00' },
        { archivoUrl: 'javascript:alert(1)' },
        { montoTotal: '1.00' },
        { versionClausulas: ' ' },
      ])
        await expect(
          '/admin/contratos',
          'POST',
          { ...payload(), ...changes },
          400,
        );
      for (const changes of [
        { precioUnitario: '0' },
        { cantidad: 0 },
        { precioUnitario: '1.001' },
        { descuento: '101' },
        { cantidad: 32767, precioUnitario: '99999999.99' },
        { idServicio: 999999 },
      ]) {
        const body = payload();
        Object.assign(body.propuesta.detalles[0], changes);
        await expect('/admin/contratos', 'POST', body, 400);
      }
      await expect(
        '/admin/contratos',
        'POST',
        { ...payload(), idLead: '999999' },
        404,
      );
      assert.equal(
        (await db.query('SELECT count(*)::int n FROM propuesta'))[0].n,
        count,
      );
    },
  );
  await check(
    'Fallo final revierte propuesta, detalles y contrato',
    async () => {
      await db.query(`CREATE FUNCTION fail_test_contract() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test' USING ERRCODE='23514'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_contract_failure BEFORE INSERT ON contrato FOR EACH ROW WHEN (NEW.version_clausulas='rollback-test') EXECUTE FUNCTION fail_test_contract()`);
      const before = (
        await db.query(
          'SELECT (SELECT count(*) FROM propuesta) p,(SELECT count(*) FROM propuesta_detalle) d,(SELECT count(*) FROM contrato) c',
        )
      )[0];
      await expect(
        '/admin/contratos',
        'POST',
        { ...payload(), versionClausulas: 'rollback-test' },
        400,
      );
      assert.deepEqual(
        (
          await db.query(
            'SELECT (SELECT count(*) FROM propuesta) p,(SELECT count(*) FROM propuesta_detalle) d,(SELECT count(*) FROM contrato) c',
          )
        )[0],
        before,
      );
      await db.query(
        'DROP TRIGGER test_contract_failure ON contrato; DROP FUNCTION fail_test_contract()',
      );
    },
  );
  await check(
    'Listado compatible, filtros, fecha de Lima y paginación',
    async () => {
      for (const query of [
        'q=Nora',
        'q=nora%40example.test',
        `q=${contract.idContrato}`,
        'moneda=PEN&planificacion=sin&desde=2026-10-15&hasta=2026-10-15',
      ])
        assert.equal((await expect(`/admin/contratos?${query}`)).total, 1);
      assert.equal((await expect('/admin/contratos?moneda=USD')).total, 0);
      assert.equal(
        (await expect('/admin/contratos?planificacion=con')).total,
        0,
      );
      assert.equal(
        (await expect('/admin/contratos?page=2&pageSize=1')).items.length,
        0,
      );
      assert.equal(
        (await expect('/admin/contratos?desde=2026-10-16')).total,
        0,
      );
      await expect(
        '/admin/contratos?desde=2026-10-16&hasta=2026-10-15',
        'GET',
        undefined,
        400,
      );
      assert.equal((await expect('/admin/contratos')).pageSize, 20);
    },
  );
  await check(
    'Edición financiera sin dependencias y lead/propuesta inmutables',
    async () => {
      contract = await expect(
        `/admin/contratos/${contract.idContrato}`,
        'PATCH',
        {
          propuesta: terms('200.00'),
          fechaFirma: '2026-10-16T00:30:00Z',
          versionClausulas: '1.1',
        },
      );
      assert.equal(contract.montoTotal, '200.00');
      assert.equal(contract.propuesta.detalles[0].subtotal, '200.00');
      assert.equal(
        (await expect('/admin/contratos?desde=2026-10-15&hasta=2026-10-15'))
          .total,
        1,
      );
      for (const body of [
        { idLead: lead.idLead },
        { idPropuesta: contract.idPropuesta },
        { propuesta: null },
        { versionClausulas: null },
        {},
      ])
        await expect(
          `/admin/contratos/${contract.idContrato}`,
          'PATCH',
          body,
          400,
        );
    },
  );
  await check(
    'Eliminación conserva propuesta y detalles, sin modificar lead',
    async () => {
      const c = await create();
      await expect(`/admin/contratos/${c.idContrato}`, 'DELETE');
      await expect(`/admin/contratos/${c.idContrato}`, 'GET', undefined, 404);
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int n FROM propuesta_detalle WHERE id_propuesta=$1',
            [c.idPropuesta],
          )
        )[0].n,
        1,
      );
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int n FROM propuesta WHERE id_propuesta=$1',
            [c.idPropuesta],
          )
        )[0].n,
        1,
      );
    },
  );
  await check(
    'Cronograma protege finanzas; edición documental permanece disponible',
    async () => {
      const schedule = {
        cuotas: [
          { nroCuota: 1, monto: '200.00', fechaVencimiento: '2026-11-01' },
        ],
      };
      await expect(
        `/admin/contratos/${contract.idContrato}/cronograma`,
        'POST',
        schedule,
        201,
      );
      const detail = await expect(`/admin/contratos/${contract.idContrato}`);
      assert.equal(detail.editableFinanciero, false);
      assert.equal(detail.eliminable, false);
      await expect(
        `/admin/contratos/${contract.idContrato}`,
        'DELETE',
        undefined,
        409,
      );
      for (const body of [
        { propuesta: terms('150') },
        { fechaFirma: payload().fechaFirma },
        { aceptaAutoriaEstudiante: true },
      ])
        await expect(
          `/admin/contratos/${contract.idContrato}`,
          'PATCH',
          body,
          409,
        );
      const changed = await expect(
        `/admin/contratos/${contract.idContrato}`,
        'PATCH',
        {
          archivoUrl: 'https://example.test/contrato.pdf',
          versionClausulas: '2.0',
        },
      );
      assert.equal(changed.montoTotal, '200.00');
      assert.equal(changed.versionClausulas, '2.0');
      assert.equal(
        (await expect('/admin/contratos?planificacion=con')).total,
        1,
      );
      const saved = await expect(
        `/admin/contratos/${contract.idContrato}/cronograma`,
      );
      await expect(
        `/admin/cuotas/${saved.cuotas[0].idCuota}/abonos`,
        'POST',
        {
          monto: '20',
          metodo: 'yape',
          fechaPago: new Date(Date.now() - 1000).toISOString(),
          claveIdempotencia: randomUUID(),
        },
        201,
      );
      assert.equal(
        (await expect(`/admin/contratos/${contract.idContrato}`)).saldo,
        '180.00',
      );
    },
  );
  await check(
    'Cualquier pago bloquea edición financiera y eliminación, incluso sin cronograma',
    async () => {
      for (const state of [
        'pendiente',
        'rechazado',
        'reembolsado',
        'confirmado',
      ]) {
        const c = await create();
        await db.query(
          "INSERT INTO pago(id_contrato,id_lead,monto,moneda,estado) VALUES($1,$2,1,'PEN',$3)",
          [c.idContrato, lead.idLead, state],
        );
        await expect(
          `/admin/contratos/${c.idContrato}`,
          'DELETE',
          undefined,
          409,
        );
        await expect(
          `/admin/contratos/${c.idContrato}`,
          'PATCH',
          { propuesta: terms('99') },
          409,
        );
        await expect(`/admin/contratos/${c.idContrato}`, 'PATCH', {
          archivoUrl: null,
        });
      }
    },
  );
  await check(
    'Concurrencia: editar o eliminar frente a crear cronograma',
    async () => {
      for (const operation of ['PATCH', 'DELETE']) {
        const c = await create();
        const [change, schedule] = await Promise.all([
          http(
            `/admin/contratos/${c.idContrato}`,
            operation,
            operation === 'PATCH' ? { propuesta: terms('200') } : undefined,
          ),
          http(`/admin/contratos/${c.idContrato}/cronograma`, 'POST', {
            cuotas: [
              { nroCuota: 1, monto: '100.00', fechaVencimiento: '2026-11-01' },
            ],
          }),
        ]);
        const outcomes =
          operation === 'PATCH'
            ? [
                [200, 400],
                [409, 201],
              ]
            : [
                [200, 404],
                [409, 201],
              ];
        assert.ok(
          outcomes.some(
            ([a, b]) => a === change.status && b === schedule.status,
          ),
          JSON.stringify([change, schedule]),
        );
        if (schedule.status === 201)
          assert.equal(
            (await expect(`/admin/contratos/${c.idContrato}`)).montoTotal,
            '100.00',
          );
      }
    },
  );
  await check(
    'Concurrencia: abonos frente a edición financiera, documental y eliminación',
    async () => {
      const c = await create();
      await expect(
        `/admin/contratos/${c.idContrato}/cronograma`,
        'POST',
        {
          cuotas: [
            { nroCuota: 1, monto: '100.00', fechaVencimiento: '2026-11-01' },
          ],
        },
        201,
      );
      const { cuotas } = await expect(
        `/admin/contratos/${c.idContrato}/cronograma`,
      );
      for (const [method, body, status] of [
        ['PATCH', { propuesta: terms('200') }, 409],
        ['DELETE', undefined, 409],
        ['PATCH', { versionClausulas: 'concurrente' }, 200],
      ]) {
        const [mutation, abono] = await Promise.all([
          http(`/admin/contratos/${c.idContrato}`, method, body),
          http(`/admin/cuotas/${cuotas[0].idCuota}/abonos`, 'POST', {
            monto: '10',
            metodo: 'yape',
            fechaPago: new Date(Date.now() - 1000).toISOString(),
            claveIdempotencia: randomUUID(),
          }),
        ]);
        assert.equal(mutation.status, status, JSON.stringify(mutation.data));
        assert.equal(abono.status, 201, JSON.stringify(abono.data));
      }
      const saved = await expect(`/admin/contratos/${c.idContrato}`);
      assert.equal(saved.montoTotal, '100.00');
      assert.equal(saved.totalPagado, '30.00');
      assert.equal(saved.saldo, '70.00');
    },
  );
  await check(
    'Servicios desactivados y etapa histórica se conservan sin permitir nuevos usos',
    async () => {
      const [{ id_etapa: stage }] = await db.query(
        "INSERT INTO etapa_tesis(nombre,orden) VALUES('Proyecto',1) RETURNING id_etapa",
      );
      const body = payload();
      body.propuesta.detalles[0].idEtapa = stage;
      const c = await create(body);
      await db.query('UPDATE servicio SET activo=false WHERE id_servicio=$1', [
        serviceId,
      ]);
      await expect('/admin/contratos', 'POST', body, 400);
      assert.equal(
        (await expect('/admin/contratos/catalogos')).servicios.some(
          (s) => s.idServicio === serviceId,
        ),
        false,
      );
      const updated = await expect(
        `/admin/contratos/${c.idContrato}`,
        'PATCH',
        { propuesta: body.propuesta },
      );
      assert.equal(updated.propuesta.detalles[0].idEtapa, stage);
      assert.equal(updated.propuesta.detalles[0].idServicio, serviceId);
    },
  );
  console.log(`${passed} grupos de pruebas de contratos completados.`);
} finally {
  if (app) await app.close();
  if (db?.isInitialized) await db.destroy();
  if (control.isInitialized) {
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.destroy();
  }
}
