import 'reflect-metadata';
import { config } from 'dotenv';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { entities } from '../dist/entities/index.js';
import { AdminService } from '../dist/modules/admin/admin.service.js';
import { InitialSchema1791855075011 } from '../dist/migrations/1791855075011-InitialSchema.js';
import { AdminPanel1791900000000 } from '../dist/migrations/1791900000000-AdminPanel.js';
import { ContractServices1792060000000 } from '../dist/migrations/1792060000000-ContractServices.js';
import { seedDemo, demoEmails } from './seed-demo.mjs';
config({ quiet: true });
const schema = `demo_test_${randomBytes(8).toString('hex')}`;
const connection = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
};
const control = new DataSource(connection);
let db;
try {
  await control.initialize();
  await control.query(`CREATE SCHEMA ${schema}`);
  db = new DataSource({
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
  });
  await db.initialize();
  await db.runMigrations();
  await db.query(
    "INSERT INTO usuario_interno(nombres,apellidos,correo,rol) VALUES('Admin','Prueba','admin@example.test','administrador')",
  );
  const result = await seedDemo(db);
  assert.deepEqual(
    [
      result.leads,
      result.propuestas,
      result.contratos,
      result.cronogramas,
      result.cuotas,
      result.pagos,
    ],
    [32, 28, 20, 16, 64, 23],
  );
  const service = new AdminService(db);
  const overview = await service.resumen(),
    indicators = await service.impulseKpis({});
  assert.equal(Number(overview.leads.total), 32);
  assert.equal(Number(overview.leads.hoy), 4);
  assert.ok(
    overview.monedas.some(
      (m) => Number(m.vencido) > 0 && Number(m.cobrado) > 0,
    ),
  );
  assert.ok(overview.proximos.length);
  assert.equal(indicators.funnel.leads, 32);
  assert.equal(indicators.funnel.payers, 9);
  assert.equal(indicators.kpis.find((k) => k.code === 'LPO').value, 75);
  assert.equal(indicators.kpis.find((k) => k.code === 'TCP').value, 28.13);
  assert.equal(indicators.kpis.find((k) => k.code === 'TAP').value, 74.07);
  assert.equal(indicators.kpis.find((k) => k.code === 'TPC').value, 2);
  for (const code of ['CTR', 'TIL', 'TCL', 'TPR', 'TSU'])
    assert.equal(indicators.kpis.find((k) => k.code === code).value, null);
  console.log(
    'OK Dashboard e indicadores calculados desde registros demo, sin métricas inventadas en la UI',
  );
  const [invalid] = await db.query(`SELECT
    (SELECT count(*) FROM cronograma_pago cp WHERE cp.monto_programado<>(SELECT sum(c.monto) FROM cuota_pago c WHERE c.id_cronograma=cp.id_cronograma)) schedules,
    (SELECT count(*) FROM cuota_pago c WHERE c.monto<(SELECT COALESCE(sum(p.monto),0) FROM pago p WHERE p.id_cuota=c.id_cuota AND p.estado='confirmado')) overpayments,
    (SELECT count(*) FROM contrato c JOIN propuesta p USING(id_propuesta) WHERE c.id_lead<>p.id_lead) mismatched_leads,
    (SELECT count(*) FROM pago pa JOIN contrato c USING(id_contrato) JOIN propuesta pr USING(id_propuesta) WHERE pa.moneda<>pr.moneda OR pa.id_lead<>c.id_lead) mismatched_payments,
    (SELECT count(*) FROM pago pa JOIN contrato c USING(id_contrato) WHERE pa.estado='confirmado' AND (pa.fecha_pago>now() OR pa.fecha_pago<c.fecha_firma)) invalid_dates`);
  assert.ok(
    Object.values(invalid).every((n) => Number(n) === 0),
    JSON.stringify(invalid),
  );
  const states = (
    await service.cuotas({ page: 1, pageSize: 100, direction: 'asc' })
  ).items;
  for (const state of ['pagada', 'parcial', 'pendiente'])
    assert.ok(states.some((c) => c.estado === state));
  assert.ok(states.some((c) => c.vencida));
  assert.ok(states.some((c) => !c.vencida && c.estado === 'pendiente'));
  console.log(
    'OK Saldos, cuotas pagadas/parciales/pendientes/vencidas, monedas y cronología consistentes',
  );
  const before = (await db.query('SELECT count(*)::int n FROM pago'))[0].n;
  assert.equal((await seedDemo(db)).status, 'already_exists');
  assert.equal(
    (await db.query('SELECT count(*)::int n FROM pago'))[0].n,
    before,
  );
  await db.query('UPDATE lead SET correo=$1 WHERE correo=$2', [
    'renamed@example.test',
    demoEmails[0],
  ]);
  await assert.rejects(seedDemo(db), /incompleta/);
  assert.equal((await db.query('SELECT count(*)::int n FROM lead'))[0].n, 32);
  console.log(
    'OK Repetición sin duplicados y muestra parcial protegida; no se modifican datos existentes',
  );
} finally {
  if (db?.isInitialized) await db.destroy();
  if (control.isInitialized) {
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.destroy();
  }
}
