import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Los enlaces de recursos solo registran la red social de origen (canal). */
export class ResourceLinkChannelOnly1793400000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
      DROP INDEX IF EXISTS solicitud_campana_idx;
      ALTER TABLE enlace_recurso DROP COLUMN medio, DROP COLUMN campana, DROP COLUMN publicacion;
      ALTER TABLE solicitud_recurso DROP COLUMN medio, DROP COLUMN campana, DROP COLUMN publicacion;
      ALTER TABLE sesion_landing DROP COLUMN IF EXISTS campana_origen;
      CREATE INDEX solicitud_canal_idx ON solicitud_recurso(id_recurso,canal,created_at);`);
  }
  async down(q: QueryRunner) {
    await q.query(`
      DROP INDEX IF EXISTS solicitud_canal_idx;
      ALTER TABLE sesion_landing ADD COLUMN campana_origen varchar(100);
      ALTER TABLE solicitud_recurso ADD COLUMN medio varchar(100), ADD COLUMN campana varchar(100), ADD COLUMN publicacion varchar(100);
      ALTER TABLE enlace_recurso ADD COLUMN medio varchar(100), ADD COLUMN campana varchar(100), ADD COLUMN publicacion varchar(100);
      CREATE INDEX solicitud_campana_idx ON solicitud_recurso(id_recurso,canal,campana,created_at);`);
  }
}
