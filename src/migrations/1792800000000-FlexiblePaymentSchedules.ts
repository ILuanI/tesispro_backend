import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FlexiblePaymentSchedules1792800000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE modalidad_pago (
        id_modalidad serial PRIMARY KEY, nombre varchar(100) NOT NULL,
        tipo varchar(20) NOT NULL CHECK(tipo IN ('unico','mensual','fases','personalizado')),
        activa boolean NOT NULL DEFAULT false, revision int NOT NULL DEFAULT 1,
        cantidad int NOT NULL CHECK(cantidad BETWEEN 1 AND 120), fases jsonb NOT NULL DEFAULT '[]',
        condiciones varchar(3000) NOT NULL DEFAULT '',
        regla_activacion varchar(30) CHECK(regla_activacion IN ('primer_abono','primera_cuota')),
        id_usuario int REFERENCES usuario_interno(id_usuario), actualizado_en timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO modalidad_pago(nombre,tipo,cantidad) VALUES ('Pago único','unico',1),('Cuotas mensuales','mensual',3),('Por fases','fases',3),('Personalizado','personalizado',1);
      ALTER TABLE cronograma_pago ADD COLUMN revision int NOT NULL DEFAULT 0;
      CREATE TABLE cronograma_version (
        id_version serial PRIMARY KEY, id_cronograma int NOT NULL REFERENCES cronograma_pago(id_cronograma),
        numero int NOT NULL, estado varchar(30) NOT NULL DEFAULT 'borrador'
          CHECK(estado IN ('borrador','pendiente_aprobacion','negociado','en_ejecucion','completado','sustituido')),
        id_propuesta bigint NOT NULL REFERENCES propuesta(id_propuesta), version_r8 int,
        moneda char(3) NOT NULL, total_acordado numeric(10,2) NOT NULL CHECK(total_acordado>0),
        cobros_reconocidos numeric(10,2) NOT NULL CHECK(cobros_reconocidos>=0),
        monto_programado numeric(10,2) NOT NULL CHECK(monto_programado>0),
        modalidad jsonb NOT NULL, condiciones text NOT NULL DEFAULT '', motivo text NOT NULL DEFAULT '',
        historico boolean NOT NULL DEFAULT false, id_autor int NOT NULL REFERENCES usuario_interno(id_usuario),
        creado_en timestamptz NOT NULL DEFAULT now(), UNIQUE(id_cronograma,numero), UNIQUE(id_cronograma,id_version),
        CHECK(cobros_reconocidos+monto_programado=total_acordado),
        FOREIGN KEY(id_propuesta,version_r8) REFERENCES r8_propuesta_version(id_propuesta,version)
      );
      ALTER TABLE cronograma_pago ADD COLUMN id_version_actual int;
      ALTER TABLE cronograma_pago ADD FOREIGN KEY(id_cronograma,id_version_actual) REFERENCES cronograma_version(id_cronograma,id_version);
      ALTER TABLE cuota_pago DROP CONSTRAINT cuota_pago_id_cronograma_nro_cuota_key;
      ALTER TABLE cuota_pago ADD COLUMN id_version int;
      ALTER TABLE cuota_pago ADD COLUMN entregables jsonb NOT NULL DEFAULT '[]';
      ALTER TABLE cuota_pago ADD FOREIGN KEY(id_cronograma,id_version) REFERENCES cronograma_version(id_cronograma,id_version);
      CREATE UNIQUE INDEX cuota_version_numero ON cuota_pago(id_version,nro_cuota);
      CREATE TABLE cronograma_evento (
        id_evento bigserial PRIMARY KEY, id_version int REFERENCES cronograma_version(id_version),
        id_modalidad int REFERENCES modalidad_pago(id_modalidad), tipo varchar(40) NOT NULL,
        detalle jsonb NOT NULL DEFAULT '{}', id_usuario int NOT NULL REFERENCES usuario_interno(id_usuario),
        fecha timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE cuota_entrega (
        id_cuota int NOT NULL REFERENCES cuota_pago(id_cuota), indice int NOT NULL CHECK(indice>=0),
        estado varchar(20) NOT NULL CHECK(estado IN ('pendiente','en_progreso','entregado')),
        id_usuario int NOT NULL REFERENCES usuario_interno(id_usuario), fecha timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(id_cuota,indice)
      );
      INSERT INTO cronograma_version(id_cronograma,numero,estado,id_propuesta,version_r8,moneda,total_acordado,cobros_reconocidos,monto_programado,modalidad,historico,id_autor)
      SELECT cp.id_cronograma,1,CASE WHEN cp.monto_programado<=coalesce((SELECT sum(monto) FROM pago WHERE id_contrato=cp.id_contrato AND id_cuota IS NOT NULL AND estado='confirmado'),0) THEN 'completado' ELSE 'en_ejecucion' END,
        p.id_propuesta,r.version_actual,cp.moneda,p.monto_total,cp.cobros_previos,cp.monto_programado,
        '{"nombre":"Cronograma histórico","tipo":"personalizado","reglaActivacion":null}',true,cp.id_usuario
      FROM cronograma_pago cp JOIN contrato ct USING(id_contrato) JOIN propuesta p USING(id_propuesta) LEFT JOIN r8_propuesta r USING(id_propuesta);
      UPDATE cronograma_pago cp SET revision=1,id_version_actual=v.id_version FROM cronograma_version v WHERE v.id_cronograma=cp.id_cronograma;
      UPDATE cuota_pago c SET id_version=cp.id_version_actual FROM cronograma_pago cp WHERE c.id_cronograma=cp.id_cronograma;
      ALTER TABLE cuota_pago ALTER COLUMN id_version SET NOT NULL;

      CREATE FUNCTION cronograma_validar_suma() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE v cronograma_version; k int;
      BEGIN
        k := CASE WHEN TG_TABLE_NAME='cronograma_version' THEN NEW.id_version ELSE coalesce(NEW.id_version,OLD.id_version) END;
        SELECT * INTO v FROM cronograma_version WHERE id_version=k;
        IF FOUND AND (SELECT coalesce(sum(monto),0) FROM cuota_pago WHERE id_version=k)<>v.monto_programado THEN
          RAISE EXCEPTION 'La suma de cuotas no coincide con la versión' USING ERRCODE='23514';
        END IF;
        RETURN NULL;
      END $$;
      CREATE CONSTRAINT TRIGGER cronograma_suma AFTER INSERT OR UPDATE ON cronograma_version DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cronograma_validar_suma();
      CREATE CONSTRAINT TRIGGER cuota_suma AFTER INSERT OR UPDATE OR DELETE ON cuota_pago DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION cronograma_validar_suma();
      CREATE FUNCTION cronograma_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF TG_TABLE_NAME='cronograma_version' AND TG_OP='UPDATE' THEN
          IF (to_jsonb(NEW)-'estado')=(to_jsonb(OLD)-'estado') THEN RETURN NEW; END IF;
        END IF;
        RAISE EXCEPTION 'Crea otra versión para modificar el cronograma' USING ERRCODE='23514';
      END $$;
      CREATE TRIGGER version_inmutable BEFORE UPDATE OR DELETE ON cronograma_version FOR EACH ROW EXECUTE FUNCTION cronograma_inmutable();
      CREATE TRIGGER cuota_inmutable BEFORE UPDATE OR DELETE ON cuota_pago FOR EACH ROW EXECUTE FUNCTION cronograma_inmutable();

      CREATE FUNCTION cronograma_validar_pago() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE c record; pagado numeric;
      BEGIN
        IF TG_OP='UPDATE' AND OLD.id_cuota IS NOT NULL AND OLD.estado='confirmado' AND
          (to_jsonb(NEW)-'comprobante_url'-'referencia_operacion')<>(to_jsonb(OLD)-'comprobante_url'-'referencia_operacion') THEN
          RAISE EXCEPTION 'Un abono confirmado no se reasigna ni modifica' USING ERRCODE='23514';
        END IF;
        IF NEW.id_cuota IS NULL OR NEW.estado<>'confirmado' THEN RETURN NEW; END IF;
        PERFORM 1 FROM contrato WHERE id_contrato=NEW.id_contrato FOR UPDATE;
        SELECT q.*,cp.id_contrato,cp.id_version_actual,v.estado,v.moneda,ct.id_lead INTO c
          FROM cuota_pago q JOIN cronograma_pago cp USING(id_cronograma) JOIN cronograma_version v ON v.id_version=q.id_version
          JOIN contrato ct ON ct.id_contrato=cp.id_contrato WHERE q.id_cuota=NEW.id_cuota;
        IF NOT FOUND OR c.id_contrato<>NEW.id_contrato OR c.id_lead<>NEW.id_lead OR c.moneda<>NEW.moneda OR NEW.monto<=0 OR c.id_version<>c.id_version_actual
          OR (c.estado NOT IN ('negociado','en_ejecucion') AND NOT (TG_OP='UPDATE' AND OLD.estado='confirmado')) THEN
          RAISE EXCEPTION 'Pago incompatible con el cronograma vigente' USING ERRCODE='23514';
        END IF;
        SELECT coalesce(sum(monto),0) INTO pagado FROM pago WHERE id_cuota=NEW.id_cuota AND estado='confirmado' AND id_pago<>NEW.id_pago;
        IF pagado+NEW.monto>c.monto THEN RAISE EXCEPTION 'El abono supera el saldo' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER cronograma_validar_pago BEFORE INSERT OR UPDATE ON pago FOR EACH ROW EXECUTE FUNCTION cronograma_validar_pago();

      CREATE FUNCTION cronograma_actualizar_estado(k int, actor int) RETURNS void LANGUAGE plpgsql AS $$
      DECLARE v cronograma_version; total numeric; primero numeric; nuevo text;
      BEGIN
        SELECT cv.* INTO v FROM cronograma_pago cp JOIN cronograma_version cv ON cv.id_version=cp.id_version_actual WHERE cp.id_contrato=k FOR UPDATE OF cv;
        IF NOT FOUND OR v.estado NOT IN ('negociado','en_ejecucion') THEN RETURN; END IF;
        SELECT coalesce(sum(monto),0) INTO total FROM pago WHERE id_contrato=k AND estado='confirmado';
        SELECT monto INTO primero FROM cuota_pago WHERE id_version=v.id_version ORDER BY nro_cuota LIMIT 1;
        nuevo := v.estado;
        IF total>=v.total_acordado THEN nuevo:='completado';
        ELSIF v.estado='negociado' AND ((v.modalidad->>'reglaActivacion'='primer_abono' AND total>0)
          OR (v.modalidad->>'reglaActivacion'='primera_cuota' AND total>=v.cobros_reconocidos+primero)) THEN nuevo:='en_ejecucion'; END IF;
        IF nuevo<>v.estado THEN
          UPDATE cronograma_version SET estado=nuevo WHERE id_version=v.id_version;
          INSERT INTO cronograma_evento(id_version,tipo,detalle,id_usuario) VALUES(v.id_version,nuevo,jsonb_build_object('anterior',v.estado),coalesce(actor,v.id_autor));
        END IF;
      END $$;
      CREATE FUNCTION cronograma_pago_confirmado() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.estado='confirmado' THEN PERFORM cronograma_actualizar_estado(NEW.id_contrato,NEW.id_usuario_registro); END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER cronograma_confirmado AFTER INSERT OR UPDATE OF estado ON pago FOR EACH ROW EXECUTE FUNCTION cronograma_pago_confirmado();
    `);
  }
  async down() {
    throw new Error(
      'Las versiones de cronogramas conservan historia financiera; retirada manual requerida.',
    );
  }
}
