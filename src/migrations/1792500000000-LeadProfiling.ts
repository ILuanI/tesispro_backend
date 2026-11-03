import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LeadProfiling1792500000000 implements MigrationInterface {
  name = 'LeadProfiling1792500000000';
  async up(q: QueryRunner) {
    await q.query(`
      CREATE FUNCTION crm_phone(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT CASE WHEN value IS NULL OR btrim(value)='' THEN NULL
        WHEN length(regexp_replace(value,'[^0-9]','','g'))=9 THEN '+51'||regexp_replace(value,'[^0-9]','','g')
        ELSE '+'||regexp_replace(value,'[^0-9]','','g') END
      $$;
      ALTER TABLE lead ALTER COLUMN nombres DROP NOT NULL, ALTER COLUMN telefono DROP NOT NULL;
      ALTER TABLE lead ADD CONSTRAINT lead_contacto_minimo CHECK(nullif(btrim(correo),'') IS NOT NULL OR nullif(btrim(telefono),'') IS NOT NULL);
      ALTER TABLE buyer ALTER COLUMN nombres DROP NOT NULL, ALTER COLUMN telefono DROP NOT NULL;
      ALTER TABLE buyer ADD CONSTRAINT buyer_contacto_minimo CHECK(nullif(btrim(correo),'') IS NOT NULL OR nullif(btrim(telefono),'') IS NOT NULL);
      ALTER TABLE sesion_landing ADD COLUMN campana_origen varchar(100);
      ALTER TABLE recurso_gratuito DROP CONSTRAINT recurso_categoria_check, DROP CONSTRAINT recurso_formato_check;
      ALTER TABLE recurso_gratuito ALTER COLUMN formato TYPE varchar(20),
        ADD CONSTRAINT recurso_categoria_check CHECK(categoria IN ('asesoria_academica','elaboracion_tesis','metodologia_investigacion','guias_universitarias','material_propio')),
        ADD CONSTRAINT recurso_formato_check CHECK(formato IN ('pdf','word','video','png','orientativo'));
      ALTER TABLE solicitud_recurso ALTER COLUMN formato TYPE varchar(20);
      ALTER TABLE lead ADD COLUMN revision int NOT NULL DEFAULT 1, ADD COLUMN procedencia_campos jsonb NOT NULL DEFAULT '{}';
      ALTER TABLE buyer ADD COLUMN revision int NOT NULL DEFAULT 1, ADD COLUMN procedencia_campos jsonb NOT NULL DEFAULT '{}';
      ALTER TABLE seguimiento ALTER COLUMN id_propuesta DROP NOT NULL;
      ALTER TABLE seguimiento ADD COLUMN id_usuario int REFERENCES usuario_interno(id_usuario);
      ALTER TABLE reunion ALTER COLUMN id_solicitud DROP NOT NULL, ALTER COLUMN universidad DROP NOT NULL, ALTER COLUMN descripcion DROP NOT NULL;
      ALTER TABLE reunion ADD COLUMN id_sesion bigint REFERENCES sesion_landing(id_sesion), ADD COLUMN clave_idempotencia uuid UNIQUE,
        ADD COLUMN id_usuario_cancelacion int REFERENCES usuario_interno(id_usuario);
      CREATE TABLE contacto_identidad (
        tipo varchar(10) NOT NULL CHECK(tipo IN ('correo','telefono')), valor text NOT NULL,
        id_buyer bigint REFERENCES buyer(id_buyer) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        id_lead bigint REFERENCES lead(id_lead) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
        PRIMARY KEY(tipo,valor), CHECK(num_nonnulls(id_buyer,id_lead)=1)
      );
      -- A duplicate aborts the whole migration. Never guess which contact owns it.
      DO $$ BEGIN
        IF EXISTS(SELECT 1 FROM lead WHERE nullif(btrim(telefono),'') IS NOT NULL AND crm_phone(telefono) !~ '^[+][1-9][0-9]{7,14}$')
        OR EXISTS(SELECT 1 FROM buyer WHERE estado='buyer' AND nullif(btrim(telefono),'') IS NOT NULL AND crm_phone(telefono) !~ '^[+][1-9][0-9]{7,14}$') THEN
          RAISE EXCEPTION 'Hay telefonos invalidos; revisalos antes de migrar identidades.';
        END IF;
      END $$;
      INSERT INTO contacto_identidad(tipo,valor,id_lead)
        SELECT 'correo',lower(btrim(correo)),id_lead FROM lead WHERE nullif(btrim(correo),'') IS NOT NULL;
      INSERT INTO contacto_identidad(tipo,valor,id_lead)
        SELECT 'telefono',crm_phone(telefono),id_lead FROM lead WHERE nullif(btrim(telefono),'') IS NOT NULL;
      INSERT INTO contacto_identidad(tipo,valor,id_buyer)
        SELECT 'correo',lower(btrim(correo)),id_buyer FROM buyer WHERE estado='buyer' AND nullif(btrim(correo),'') IS NOT NULL;
      INSERT INTO contacto_identidad(tipo,valor,id_buyer)
        SELECT 'telefono',crm_phone(telefono),id_buyer FROM buyer WHERE estado='buyer' AND nullif(btrim(telefono),'') IS NOT NULL;
      CREATE FUNCTION crm_identity_sync() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE item record; owner_id bigint; is_lead boolean;
      BEGIN
        is_lead := TG_TABLE_NAME='lead';
        owner_id := CASE WHEN is_lead THEN (to_jsonb(NEW)->>'id_lead')::bigint ELSE (to_jsonb(NEW)->>'id_buyer')::bigint END;
        NEW.correo := nullif(lower(btrim(NEW.correo)),'');
        NEW.telefono := crm_phone(NEW.telefono);
        IF NEW.telefono IS NOT NULL AND NEW.telefono !~ '^[+][1-9][0-9]{7,14}$' THEN
          RAISE EXCEPTION 'Telefono invalido' USING ERRCODE='23514';
        END IF;
        IF NOT is_lead AND to_jsonb(NEW)->>'estado'='lead' THEN
          DELETE FROM contacto_identidad WHERE id_buyer=owner_id;
          RETURN NEW;
        END IF;
        FOR item IN SELECT * FROM (VALUES ('correo',NEW.correo),('telefono',NEW.telefono)) t(tipo,valor) WHERE valor IS NOT NULL ORDER BY tipo,valor LOOP
          PERFORM pg_advisory_xact_lock(hashtextextended('contact:'||item.tipo||':'||item.valor,0));
        END LOOP;
        DELETE FROM contacto_identidad WHERE (is_lead AND id_lead=owner_id) OR (NOT is_lead AND id_buyer=owner_id);
        FOR item IN SELECT * FROM (VALUES ('correo',NEW.correo),('telefono',NEW.telefono)) t(tipo,valor) WHERE valor IS NOT NULL LOOP
          INSERT INTO contacto_identidad(tipo,valor,id_buyer,id_lead)
          VALUES(item.tipo,item.valor,CASE WHEN NOT is_lead THEN owner_id END,CASE WHEN is_lead THEN owner_id END);
        END LOOP;
        RETURN NEW;
      END $$;
      CREATE TRIGGER crm_lead_identity BEFORE INSERT OR UPDATE OF correo,telefono ON lead FOR EACH ROW EXECUTE FUNCTION crm_identity_sync();
      CREATE TRIGGER crm_buyer_identity BEFORE INSERT OR UPDATE OF correo,telefono,estado ON buyer FOR EACH ROW EXECUTE FUNCTION crm_identity_sync();
      CREATE TABLE acceso_contacto (
        token_hash varchar(64) PRIMARY KEY, id_sesion bigint NOT NULL REFERENCES sesion_landing(id_sesion),
        id_buyer bigint REFERENCES buyer(id_buyer) ON DELETE SET NULL, id_lead bigint REFERENCES lead(id_lead) ON DELETE SET NULL,
        expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days'
      );
      CREATE TABLE evento_perfil (
        id_evento bigserial PRIMARY KEY, id_lead bigint REFERENCES lead(id_lead) ON DELETE CASCADE,
        id_buyer bigint REFERENCES buyer(id_buyer) ON DELETE SET NULL, id_sesion bigint REFERENCES sesion_landing(id_sesion),
        tipo varchar(60) NOT NULL, origen varchar(40) NOT NULL, id_usuario int REFERENCES usuario_interno(id_usuario),
        antes jsonb, despues jsonb, fecha timestamptz NOT NULL DEFAULT now(), clave uuid UNIQUE
      );
      CREATE INDEX evento_perfil_lead_idx ON evento_perfil(id_lead,fecha DESC,id_evento DESC);
      ALTER TABLE conversacion ADD COLUMN id_sesion bigint REFERENCES sesion_landing(id_sesion);
      CREATE TABLE turno_tesi (
        id_turno uuid PRIMARY KEY, id_conversacion bigint NOT NULL REFERENCES conversacion(id_conversacion),
        id_mensaje bigint NOT NULL REFERENCES mensaje(id_mensaje), respuesta jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE sugerencia_perfil (
        id_sugerencia bigserial PRIMARY KEY, id_lead bigint REFERENCES lead(id_lead) ON DELETE CASCADE,
        id_buyer bigint REFERENCES buyer(id_buyer) ON DELETE SET NULL,
        id_conversacion bigint NOT NULL REFERENCES conversacion(id_conversacion),
        id_mensaje bigint NOT NULL REFERENCES mensaje(id_mensaje), campo varchar(60) NOT NULL, valor jsonb NOT NULL,
        estado varchar(15) NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','aceptada','rechazada')),
        id_usuario int REFERENCES usuario_interno(id_usuario), fecha timestamptz NOT NULL DEFAULT now(), resuelta_at timestamptz,
        UNIQUE(id_mensaje,campo)
      );
      CREATE INDEX seguimiento_lead_fecha_idx ON seguimiento(id_lead,fecha_programada);
      CREATE INDEX conversacion_lead_idx ON conversacion(id_lead,iniciada_en);
      CREATE UNIQUE INDEX conversacion_sesion_tesi_idx ON conversacion(id_sesion) WHERE id_sesion IS NOT NULL AND cerrada_en IS NULL;
    `);
  }
  async down(): Promise<void> {
    throw new Error(
      'R6 contiene auditoria e identidades compartidas. Respaldar y preparar una migracion de retirada explicita.',
    );
  }
}
