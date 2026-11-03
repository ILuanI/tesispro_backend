import { MigrationInterface, QueryRunner } from 'typeorm';

export class TesiQualification1792600000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE calificacion_tesi (
        id_calificacion bigserial PRIMARY KEY,
        id_conversacion bigint NOT NULL REFERENCES conversacion(id_conversacion),
        id_turno uuid NOT NULL UNIQUE REFERENCES turno_tesi(id_turno),
        id_lead bigint REFERENCES lead(id_lead),
        id_buyer bigint REFERENCES buyer(id_buyer),
        resultado jsonb NOT NULL,
        version_reglas varchar(64) NOT NULL,
        fecha timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX calificacion_tesi_conversacion_idx ON calificacion_tesi(id_conversacion, id_calificacion DESC);
      ALTER TABLE derivacion_humana ADD COLUMN evidencia jsonb;
      CREATE UNIQUE INDEX derivacion_tesi_abierta_idx ON derivacion_humana(id_conversacion)
        WHERE estado IN ('pendiente', 'en_atencion');
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX derivacion_tesi_abierta_idx; ALTER TABLE derivacion_humana DROP COLUMN evidencia; DROP TABLE calificacion_tesi');
  }
}
