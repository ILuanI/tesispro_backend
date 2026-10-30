import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminPanel1791900000000 implements MigrationInterface {
  name = 'AdminPanel1791900000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      INSERT INTO estado_lead(codigo,nombre,fase,orden) VALUES
        ('nuevo','Nuevo',1,1),('calificado','Calificado',1,2),('en_negociacion','En negociación',2,3),
        ('propuesta_enviada','Propuesta enviada',2,4),('payer','Cliente (pagó)',2,5),('perdido','Perdido',2,6)
      ON CONFLICT(codigo) DO NOTHING;
      ALTER TABLE usuario_interno ADD COLUMN password_hash TEXT;
      CREATE TABLE sesion_admin (
        token_hash VARCHAR(64) PRIMARY KEY,
        id_usuario INTEGER NOT NULL REFERENCES usuario_interno(id_usuario) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX idx_sesion_expira ON sesion_admin(expires_at);
      CREATE TABLE cronograma_pago (
        id_cronograma SERIAL PRIMARY KEY,
        id_contrato INTEGER NOT NULL UNIQUE REFERENCES contrato(id_contrato),
        monto_programado NUMERIC(10,2) NOT NULL CHECK(monto_programado > 0),
        cobros_previos NUMERIC(10,2) NOT NULL CHECK(cobros_previos >= 0),
        moneda CHAR(3) NOT NULL,
        id_usuario INTEGER NOT NULL REFERENCES usuario_interno(id_usuario),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE cuota_pago (
        id_cuota SERIAL PRIMARY KEY,
        id_cronograma INTEGER NOT NULL REFERENCES cronograma_pago(id_cronograma),
        nro_cuota SMALLINT NOT NULL CHECK(nro_cuota > 0),
        monto NUMERIC(10,2) NOT NULL CHECK(monto > 0),
        fecha_vencimiento DATE NOT NULL,
        UNIQUE(id_cronograma,nro_cuota)
      );
      CREATE INDEX idx_cuota_vencimiento ON cuota_pago(fecha_vencimiento);
      ALTER TABLE pago ADD COLUMN id_cuota INTEGER REFERENCES cuota_pago(id_cuota);
      ALTER TABLE pago ADD COLUMN id_usuario_registro INTEGER REFERENCES usuario_interno(id_usuario);
      ALTER TABLE pago ADD COLUMN clave_idempotencia UUID UNIQUE;
      CREATE INDEX idx_pago_cuota ON pago(id_cuota) WHERE id_cuota IS NOT NULL;
      CREATE INDEX idx_lead_fecha ON lead(fecha_registro DESC);
      CREATE INDEX idx_lead_responsable ON lead(id_responsable);
      CREATE OR REPLACE FUNCTION fn_lead_historial() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'INSERT' OR NEW.id_estado IS DISTINCT FROM OLD.id_estado THEN
          INSERT INTO lead_estado_historial(id_lead,id_estado,id_usuario,motivo)
          VALUES(NEW.id_lead,NEW.id_estado,
            NULLIF(current_setting('app.admin_usuario',true),'')::integer,
            NULLIF(current_setting('app.admin_motivo',true),''));
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE OR REPLACE FUNCTION fn_lead_historial() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'INSERT' OR NEW.id_estado IS DISTINCT FROM OLD.id_estado THEN
          INSERT INTO lead_estado_historial(id_lead,id_estado) VALUES(NEW.id_lead,NEW.id_estado);
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      DROP INDEX idx_lead_responsable;
      DROP INDEX idx_lead_fecha;
      ALTER TABLE pago DROP COLUMN clave_idempotencia, DROP COLUMN id_usuario_registro, DROP COLUMN id_cuota;
      DROP TABLE cuota_pago, cronograma_pago, sesion_admin;
      ALTER TABLE usuario_interno DROP COLUMN password_hash;
    `);
  }
}
