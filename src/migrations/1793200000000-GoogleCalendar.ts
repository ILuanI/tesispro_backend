import type { MigrationInterface, QueryRunner } from 'typeorm';

export class GoogleCalendar1793200000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE google_calendar_connection (
        id int PRIMARY KEY CHECK(id=1), refresh_token text NOT NULL,
        calendar_id text, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE google_calendar_oauth (
        state_hash text PRIMARY KEY, id_usuario int NOT NULL REFERENCES usuario_interno(id_usuario),
        verifier text NOT NULL, expires_at timestamptz NOT NULL
      );
      CREATE TABLE calendar_rate_limit (
        key text PRIMARY KEY, window_at timestamptz NOT NULL, attempts int NOT NULL
      );
      ALTER TABLE reunion ADD COLUMN google_calendar_id text, ADD COLUMN external_event_id text,
        ADD COLUMN event_url text, ADD COLUMN meet_url text, ADD COLUMN meet_status text,
        ADD COLUMN sync_status text NOT NULL DEFAULT 'sin_vincular', ADD COLUMN sync_error text,
        ADD COLUMN synced_at timestamptz, ADD COLUMN pending_action text,
        ADD COLUMN pending_data jsonb, ADD COLUMN revision int NOT NULL DEFAULT 1;
      CREATE UNIQUE INDEX reunion_google_event ON reunion(google_calendar_id,external_event_id);
      -- Google can move meetings outside our booking hours or change their duration.
      -- Keep only positive-duration validation in SQL; new bookings validate business rules in NestJS.
      DO $$ DECLARE c record; BEGIN
        FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='reunion'::regclass AND contype='c'
          AND (pg_get_constraintdef(oid) LIKE '%fecha_inicio%' OR pg_get_constraintdef(oid) LIKE '%estado%')
        LOOP EXECUTE format('ALTER TABLE reunion DROP CONSTRAINT %I',c.conname); END LOOP;
      END $$;
      ALTER TABLE reunion ADD CONSTRAINT reunion_estado_calendar CHECK(estado IN ('pendiente','confirmada','cancelada')),
        ADD CONSTRAINT reunion_duracion_calendar CHECK(fecha_fin>fecha_inicio);
      ALTER TABLE reunion ALTER COLUMN estado SET DEFAULT 'pendiente';
      DROP INDEX reunion_cupo_unico;
      CREATE UNIQUE INDEX reunion_cupo_unico ON reunion(fecha_inicio) WHERE estado IN ('pendiente','confirmada');
      DROP INDEX reunion_solicitud_unica;
      CREATE UNIQUE INDEX reunion_solicitud_unica ON reunion(id_solicitud) WHERE estado IN ('pendiente','confirmada');
      CREATE TABLE calendar_hold (
        id_reunion uuid PRIMARY KEY REFERENCES reunion(id_reunion),
        start_at timestamptz NOT NULL, end_at timestamptz NOT NULL CHECK(end_at>start_at)
      );
      CREATE TABLE calendar_operation (
        id bigserial PRIMARY KEY, id_reunion uuid NOT NULL REFERENCES reunion(id_reunion),
        action text NOT NULL, id_usuario int REFERENCES usuario_interno(id_usuario),
        status text NOT NULL, error text, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX reunion_calendar_range ON reunion(fecha_inicio,fecha_fin);
    `);
  }
  async down(): Promise<void> {
    throw new Error('La integración conserva operaciones y eventos externos. Realiza un respaldo antes de retirarla.');
  }
}
