import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentVerification1792900000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
      ALTER TABLE pago ADD COLUMN id_verificador int REFERENCES usuario_interno(id_usuario),
        ADD COLUMN verificado_en timestamptz, ADD COLUMN motivo_decision text,
        ADD COLUMN clave_decision uuid UNIQUE, ADD COLUMN historico boolean NOT NULL DEFAULT false,
        ADD COLUMN id_pago_origen int REFERENCES pago(id_pago);
      DROP TRIGGER cronograma_validar_pago ON pago;
      UPDATE pago SET historico=true;
      CREATE TABLE pago_evento (
        id_evento bigserial PRIMARY KEY,id_pago int NOT NULL REFERENCES pago(id_pago),tipo varchar(40) NOT NULL,
        detalle jsonb NOT NULL DEFAULT '{}',id_usuario int REFERENCES usuario_interno(id_usuario),fecha timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE pago_comprobante (
        id_comprobante serial PRIMARY KEY,id_pago int NOT NULL REFERENCES pago(id_pago),nombre varchar(255) NOT NULL,
        mime varchar(50) NOT NULL CHECK(mime IN ('application/pdf','image/png','image/jpeg')),
        contenido bytea NOT NULL CHECK(octet_length(contenido)>0 AND octet_length(contenido)<=10485760),
        huella char(64) NOT NULL,id_usuario int NOT NULL REFERENCES usuario_interno(id_usuario),fecha timestamptz NOT NULL DEFAULT now(),
        UNIQUE(id_pago,huella)
      );
      CREATE TABLE pago_rectificacion (
        id_rectificacion serial PRIMARY KEY,id_pago int NOT NULL REFERENCES pago(id_pago),motivo text NOT NULL CHECK(length(trim(motivo))>0),
        id_solicitante int NOT NULL REFERENCES usuario_interno(id_usuario),estado varchar(20) NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','confirmado','rechazado')),
        id_verificador int REFERENCES usuario_interno(id_usuario),motivo_decision text,creado_en timestamptz NOT NULL DEFAULT now(),verificado_en timestamptz,
        clave_idempotencia uuid NOT NULL UNIQUE,clave_decision uuid UNIQUE,
        CHECK(id_verificador IS NULL OR id_solicitante<>id_verificador)
      );
      CREATE UNIQUE INDEX pago_rectificacion_unica ON pago_rectificacion(id_pago) WHERE estado IN ('pendiente','confirmado');
      ALTER TABLE cronograma_version ADD COLUMN id_rectificacion int REFERENCES pago_rectificacion(id_rectificacion);
      CREATE VIEW pago_neto AS SELECT (jsonb_populate_record(NULL::pago,to_jsonb(p)||jsonb_build_object('monto',CASE WHEN r.id_rectificacion IS NOT NULL THEN 0::numeric(10,2) ELSE p.monto END))).*
        FROM pago p LEFT JOIN pago_rectificacion r ON r.id_pago=p.id_pago AND r.estado='confirmado';
      CREATE FUNCTION pago_solo_insertar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        RAISE EXCEPTION 'El historial financiero es inmutable' USING ERRCODE='23514';
      END $$;
      CREATE TRIGGER pago_evento_inmutable BEFORE UPDATE OR DELETE ON pago_evento FOR EACH ROW EXECUTE FUNCTION pago_solo_insertar();
      CREATE TRIGGER pago_comprobante_inmutable BEFORE UPDATE OR DELETE ON pago_comprobante FOR EACH ROW EXECUTE FUNCTION pago_solo_insertar();
      INSERT INTO pago_evento(id_pago,tipo,detalle) SELECT id_pago,'historico',jsonb_build_object('estado',estado,'verificadorAcreditado',false) FROM pago;

      CREATE OR REPLACE FUNCTION cronograma_validar_pago() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE c record; pagado numeric; registrador record; verificador record;
      BEGIN
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'No se eliminan pagos' USING ERRCODE='23514'; END IF;
        IF TG_OP='INSERT' THEN
          SELECT * INTO registrador FROM usuario_interno WHERE id_usuario=NEW.id_usuario_registro AND activo;
          IF NEW.estado<>'pendiente' OR registrador.rol IS DISTINCT FROM 'asesor_comercial' OR NEW.historico OR NEW.monto<=0 OR NEW.clave_idempotencia IS NULL THEN
            RAISE EXCEPTION 'El asesor registra pagos pendientes' USING ERRCODE='23514'; END IF;
        ELSE
          IF (to_jsonb(NEW)-'estado'-'id_verificador'-'verificado_en'-'motivo_decision'-'clave_decision')<>(to_jsonb(OLD)-'estado'-'id_verificador'-'verificado_en'-'motivo_decision'-'clave_decision') OR OLD.estado<>'pendiente' OR NEW.estado NOT IN ('confirmado','rechazado') THEN
            RAISE EXCEPTION 'Conserva el pago original; registra una rectificación' USING ERRCODE='23514'; END IF;
          SELECT * INTO verificador FROM usuario_interno WHERE id_usuario=NEW.id_verificador AND activo;
          IF verificador.rol IS DISTINCT FROM 'administrador' OR NEW.id_verificador=NEW.id_usuario_registro OR NEW.verificado_en IS NULL OR coalesce(length(trim(NEW.motivo_decision)),0)=0 OR NEW.clave_decision IS NULL THEN
            RAISE EXCEPTION 'Verificación independiente requerida' USING ERRCODE='23514'; END IF;
          IF NEW.id_usuario_registro IS NULL AND NOT EXISTS(SELECT 1 FROM pago_evento WHERE id_pago=NEW.id_pago AND tipo='regularizacion' AND id_usuario<>NEW.id_verificador) THEN
            RAISE EXCEPTION 'Regulariza el pago histórico antes de verificar' USING ERRCODE='23514'; END IF;
        END IF;
        PERFORM 1 FROM contrato WHERE id_contrato=NEW.id_contrato FOR UPDATE;
        IF NEW.id_cuota IS NULL THEN
          IF TG_OP='INSERT' THEN RAISE EXCEPTION 'Selecciona una cuota' USING ERRCODE='23514'; END IF;
          IF NEW.estado='confirmado' THEN
            SELECT p.moneda,ct.id_lead,p.monto_total INTO c FROM contrato ct JOIN propuesta p USING(id_propuesta) WHERE ct.id_contrato=NEW.id_contrato;
            SELECT coalesce(sum(monto),0) INTO pagado FROM pago_neto WHERE id_contrato=NEW.id_contrato AND estado='confirmado';
            IF c.moneda<>NEW.moneda OR c.id_lead<>NEW.id_lead OR NEW.monto<=0 OR pagado+NEW.monto>c.monto_total THEN RAISE EXCEPTION 'Cobro histórico inconsistente' USING ERRCODE='23514'; END IF;
          END IF;
          RETURN NEW;
        END IF;
        IF NEW.estado='rechazado' THEN RETURN NEW; END IF;
        SELECT q.*,cp.id_contrato,cp.id_version_actual,v.estado,v.moneda,ct.id_lead INTO c
          FROM cuota_pago q JOIN cronograma_pago cp USING(id_cronograma) JOIN cronograma_version v ON v.id_version=q.id_version JOIN contrato ct ON ct.id_contrato=cp.id_contrato WHERE q.id_cuota=NEW.id_cuota;
        IF NOT FOUND OR c.id_contrato<>NEW.id_contrato OR c.id_lead<>NEW.id_lead OR c.moneda<>NEW.moneda OR c.id_version<>c.id_version_actual OR c.estado NOT IN ('negociado','en_ejecucion') THEN
          RAISE EXCEPTION 'Cuota incompatible con el cronograma vigente' USING ERRCODE='23514'; END IF;
        IF NEW.estado='confirmado' THEN
          SELECT coalesce(sum(monto),0) INTO pagado FROM pago_neto WHERE id_cuota=NEW.id_cuota AND estado='confirmado';
          IF pagado+NEW.monto>c.monto THEN RAISE EXCEPTION 'El abono supera el saldo' USING ERRCODE='23514'; END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER cronograma_validar_pago BEFORE INSERT OR UPDATE OR DELETE ON pago FOR EACH ROW EXECUTE FUNCTION cronograma_validar_pago();
      CREATE FUNCTION pago_auditar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        INSERT INTO pago_evento(id_pago,tipo,id_usuario,detalle) VALUES(NEW.id_pago,CASE WHEN TG_OP='INSERT' THEN 'registro' ELSE NEW.estado::text END,CASE WHEN TG_OP='INSERT' THEN NEW.id_usuario_registro ELSE NEW.id_verificador END,jsonb_build_object('estado',NEW.estado,'motivo',NEW.motivo_decision));
        RETURN NEW;
      END $$;
      CREATE TRIGGER pago_auditar AFTER INSERT OR UPDATE ON pago FOR EACH ROW EXECUTE FUNCTION pago_auditar();
      CREATE FUNCTION rectificacion_validar() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE actor record; original pago; BEGIN
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'No se eliminan rectificaciones' USING ERRCODE='23514'; END IF;
        SELECT * INTO original FROM pago WHERE id_pago=NEW.id_pago;
        IF original.estado<>'confirmado' THEN RAISE EXCEPTION 'Solo se rectifican confirmados' USING ERRCODE='23514'; END IF;
        IF TG_OP='INSERT' THEN
          SELECT * INTO actor FROM usuario_interno WHERE id_usuario=NEW.id_solicitante AND activo;
          IF actor.rol IS DISTINCT FROM 'asesor_comercial' OR NEW.estado<>'pendiente' OR NEW.id_verificador IS NOT NULL THEN RAISE EXCEPTION 'Solicitud del asesor requerida' USING ERRCODE='23514'; END IF;
        ELSE
          SELECT * INTO actor FROM usuario_interno WHERE id_usuario=NEW.id_verificador AND activo;
          IF actor.rol IS DISTINCT FROM 'administrador' OR NEW.id_verificador=NEW.id_solicitante OR NEW.id_verificador=original.id_usuario_registro OR OLD.estado<>'pendiente' OR NEW.estado NOT IN ('confirmado','rechazado') OR coalesce(length(trim(NEW.motivo_decision)),0)=0 OR NEW.clave_decision IS NULL OR NEW.verificado_en IS NULL OR
            (to_jsonb(NEW)-'estado'-'id_verificador'-'motivo_decision'-'verificado_en'-'clave_decision')<>(to_jsonb(OLD)-'estado'-'id_verificador'-'motivo_decision'-'verificado_en'-'clave_decision') THEN
            RAISE EXCEPTION 'Rectificación independiente e inmutable requerida' USING ERRCODE='23514'; END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER rectificacion_validar BEFORE INSERT OR UPDATE OR DELETE ON pago_rectificacion FOR EACH ROW EXECUTE FUNCTION rectificacion_validar();
    `);
    // Keep R13 activation behavior, now reading net confirmed amounts.
    const [{ definition }] = await q.query(
      "SELECT pg_get_functiondef('cronograma_actualizar_estado(integer,integer)'::regprocedure) AS definition",
    );
    await q.query(
      definition
        .replaceAll('FROM pago WHERE', 'FROM pago_neto WHERE')
        .replaceAll('FROM pago p WHERE', 'FROM pago_neto p WHERE'),
    );
  }
  async down() {
    throw new Error(
      'La auditoría y evidencia de pagos requieren conservación.',
    );
  }
}
