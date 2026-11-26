import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import source from '../dist/database/typeorm.config.js';
import { seedAll } from './seed-modules.mjs';

const schema = `seed_modules_test_${randomBytes(8).toString('hex')}`;
const control = new DataSource({ ...source.options, migrations: [], entities: [] });
let db;
try {
  await control.initialize();
  await control.query(`CREATE SCHEMA ${schema}`);
  db = new DataSource({ ...source.options, schema, extra: { options: `-c search_path=${schema}` } });
  await db.initialize();
  await db.runMigrations();
  await db.query("INSERT INTO usuario_interno(nombres,apellidos,correo,rol) VALUES('Patricia','Suárez','patricia.suarez@tesispro.net','administrador')");
  const first = await seedAll(db);
  assert.equal(first.modules.estado, 'creado');
  const second = await seedAll(db);
  assert.equal(second.modules.estado, 'ya_cargado');
  assert.equal(second.base.estado, 'ya_cargado');
  const empty = await db.query(`SELECT c.relname t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relkind='r' AND c.relname NOT IN ('migrations','google_calendar_connection','google_calendar_oauth','calendar_operation','calendar_rate_limit','calendar_hold','sesion_admin','acceso_contacto','pago_rectificacion','r8_incompatibilidad','r8_paquete_opcional','propuesta_paquete')`, [schema]);
  const missing = [];
  for (const { t } of empty) if (!(await db.query(`SELECT 1 FROM "${t}" LIMIT 1`)).length) missing.push(t);
  console.log(JSON.stringify(first.modules));
  console.log('Tablas vacías:', missing.join(', ') || 'ninguna');
} finally {
  if (db?.isInitialized) await db.destroy();
  await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
  if (control.isInitialized) await control.destroy();
}
