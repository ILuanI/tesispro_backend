import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import source from '../dist/database/typeorm.config.js';
import { seed, seedEmails } from './seed.mjs';
import { ContactIdentityService } from '../dist/modules/admin/contact-identity.service.js';
import { LeadProfileService } from '../dist/modules/admin/lead-profile.service.js';
import { PaymentVerificationService } from '../dist/modules/admin/payment-verification.service.js';
import { PaymentSchedulesService } from '../dist/modules/admin/payment-schedules.service.js';
import { AdminService } from '../dist/modules/admin/admin.service.js';
import { ContractsService } from '../dist/modules/admin/contracts.service.js';
import { PackagesService } from '../dist/modules/admin/packages.service.js';

const schema = `seed_test_${randomBytes(8).toString('hex')}`;
const control = new DataSource({ ...source.options, migrations: [], entities: [] });
let db;
try {
  await control.initialize();
  await control.query(`CREATE SCHEMA ${schema}`);
  db = new DataSource({ ...source.options, schema, extra: { options: `-c search_path=${schema}` } });
  await db.initialize();
  await db.runMigrations();
  await assert.rejects(() => seed(db), /administrador activo/);
  assert.equal((await db.query("SELECT to_regclass('carga_inicial') AS tabla"))[0].tabla, null);
  await db.query("INSERT INTO usuario_interno(nombres,apellidos,correo,rol) VALUES('Patricia','Suárez','patricia.suarez@tesispro.net','administrador')");
  const first = await seed(db);
  assert.equal(first.estado, 'creado');
  const second = await seed(db);
  assert.equal(second.estado, 'ya_cargado');
  assert.deepEqual({ ...second, estado: first.estado }, first);
  const expected = { lead: 24, buyer: 8, recurso_gratuito: 4, solicitud_recurso: 32, reunion: 6,
    conversacion: 24, calificacion_tesi: 24, propuesta: 18, contrato: 10, cronograma_pago: 10,
    cronograma_version: 11, seguimiento: 24 };
  for (const [table, count] of Object.entries(expected)) {
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`))[0].n, count, table);
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM contacto_identidad'))[0].n, 64);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM lead WHERE correo=ANY($1::text[])', [seedEmails]))[0].n, 24);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM lead WHERE concat_ws(' ',nombres,apellidos) ~* '(demo|simulado|ficticio)'"))[0].n, 0);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM pago WHERE estado='confirmado'
    AND (id_verificador IS NULL OR id_usuario_registro=id_verificador OR motivo_decision IS NULL)`))[0].n, 0);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM cronograma_version v WHERE
    monto_programado<>(SELECT sum(monto) FROM cuota_pago WHERE id_version=v.id_version)
    OR total_acordado<>monto_programado+cobros_reconocidos`))[0].n, 0);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM cronograma_pago cp
    JOIN contrato c USING(id_contrato) JOIN propuesta p USING(id_propuesta)
    WHERE p.monto_total<>(SELECT coalesce(sum(monto),0) FROM pago_neto WHERE id_contrato=c.id_contrato AND estado='confirmado')+
    (SELECT coalesce(sum(q.monto-(SELECT coalesce(sum(n.monto),0) FROM pago_neto n WHERE n.id_cuota=q.id_cuota AND n.estado='confirmado')),0)
    FROM cuota_pago q WHERE q.id_version=cp.id_version_actual) AND cp.id_version_actual IS NOT NULL`))[0].n, 0);
  const profiles = new LeadProfileService(db, new ContactIdentityService());
  const payments = new PaymentVerificationService(db);
  const schedules = new PaymentSchedulesService(db, payments);
  const admin = new AdminService(db, profiles, schedules);
  const contracts = new ContractsService(db, admin, new PackagesService(db));
  for (const { id_lead } of await db.query('SELECT id_lead FROM lead')) {
    const detail = await admin.lead(id_lead);
    assert.ok(detail);
  }
  for (const { id_contrato } of await db.query('SELECT id_contrato FROM contrato')) {
    assert.ok((await contracts.detail(id_contrato)).propuesta);
    assert.ok((await schedules.detail(id_contrato)).versiones.length);
  }
  assert.equal((await payments.list({ page: 1, pageSize: 100 })).total, first.pagos);
  assert.ok((await db.query('SELECT count(*)::int AS n FROM pago_comprobante'))[0].n > 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM cronograma_version WHERE estado='sustituido'"))[0].n, 1);
  assert.ok((await db.query("SELECT count(*)::int AS n FROM cronograma_version WHERE estado='completado'"))[0].n > 0);
  console.log('OK: carga atómica, segunda ejecución, identidades, fichas, versiones, contratos, saldos y verificación independiente.');
  console.log(JSON.stringify(first, null, 2));
} finally {
  if (db?.isInitialized) await db.destroy();
  if (control.isInitialized) {
    if (!/^seed_test_[a-f0-9]{16}$/.test(schema)) throw new Error('Esquema inesperado.');
    await control.query(`DROP SCHEMA ${schema} CASCADE`);
    await control.destroy();
  }
}
