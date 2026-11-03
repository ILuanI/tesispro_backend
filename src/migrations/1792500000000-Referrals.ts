import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Referrals1792500000000 implements MigrationInterface {
  name = 'Referrals1792500000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE enlace_referido ADD COLUMN id_cliente int REFERENCES cliente(id_cliente),
        ADD COLUMN fecha_actualizacion timestamptz NOT NULL DEFAULT now();
      UPDATE enlace_referido e SET id_cliente=c.id_cliente FROM cliente c WHERE c.id_lead=e.id_lead_referente
        AND e.id_referido=(SELECT min(x.id_referido) FROM enlace_referido x WHERE x.id_lead_referente=c.id_lead);
      UPDATE enlace_referido SET activo=false WHERE id_cliente IS NULL OR codigo !~ '^[a-f0-9]{30}$';
      CREATE INDEX enlace_referido_cliente_idx ON enlace_referido(id_cliente);
      CREATE UNIQUE INDEX enlace_referido_cliente_activo_idx ON enlace_referido(id_cliente) WHERE activo AND id_cliente IS NOT NULL;
      CREATE TABLE contexto_referido (
        token_hash varchar(64) PRIMARY KEY,
        id_referido int NOT NULL REFERENCES enlace_referido(id_referido),
        fecha_creacion timestamptz NOT NULL DEFAULT now(),
        expira_at timestamptz NOT NULL
      );
      CREATE INDEX contexto_referido_expira_idx ON contexto_referido(expira_at);
      CREATE TABLE atribucion_referido (
        id_atribucion bigserial PRIMARY KEY,
        id_referido int NOT NULL REFERENCES enlace_referido(id_referido),
        id_buyer bigint UNIQUE REFERENCES buyer(id_buyer),
        id_lead bigint UNIQUE REFERENCES lead(id_lead),
        fecha_captacion timestamptz NOT NULL DEFAULT now(),
        CHECK(id_buyer IS NOT NULL OR id_lead IS NOT NULL)
      );
      CREATE INDEX atribucion_referido_codigo_idx ON atribucion_referido(id_referido,fecha_captacion);
      CREATE FUNCTION r4_convertir_buyer() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id_lead IS NOT NULL AND OLD.id_lead IS DISTINCT FROM NEW.id_lead THEN
          UPDATE atribucion_referido SET id_lead=NEW.id_lead WHERE id_buyer=NEW.id_buyer;
        END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER r4_buyer_convertido AFTER UPDATE OF id_lead ON buyer FOR EACH ROW EXECUTE FUNCTION r4_convertir_buyer();
      CREATE FUNCTION r4_validar_atribucion() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE referente bigint;
      BEGIN
        SELECT id_lead_referente INTO referente FROM enlace_referido WHERE id_referido=NEW.id_referido;
        IF NEW.id_lead=referente THEN RAISE EXCEPTION 'Autorreferido no permitido' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER r4_validar_atribucion BEFORE INSERT OR UPDATE ON atribucion_referido FOR EACH ROW EXECUTE FUNCTION r4_validar_atribucion();
    `);
  }
  async down(): Promise<void> {
    throw new Error(
      'Conserva el historial R4: requiere respaldo y retirada manual revisada.',
    );
  }
}
