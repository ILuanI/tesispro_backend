import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentActivationGuard1792810000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`CREATE OR REPLACE FUNCTION cronograma_actualizar_estado(k int, actor int) RETURNS void LANGUAGE plpgsql AS $$
      DECLARE v cronograma_version; total numeric; primero numeric; primera_pagada numeric; nuevo text;
      BEGIN
        SELECT cv.* INTO v FROM cronograma_pago cp JOIN cronograma_version cv ON cv.id_version=cp.id_version_actual WHERE cp.id_contrato=k FOR UPDATE OF cv;
        IF NOT FOUND OR v.estado NOT IN ('negociado','en_ejecucion') THEN RETURN; END IF;
        SELECT coalesce(sum(monto),0) INTO total FROM pago WHERE id_contrato=k AND estado='confirmado';
        SELECT c.monto,coalesce((SELECT sum(p.monto) FROM pago p WHERE p.id_cuota=c.id_cuota AND p.estado='confirmado'),0)
          INTO primero,primera_pagada FROM cuota_pago c WHERE id_version=v.id_version ORDER BY nro_cuota LIMIT 1;
        nuevo := v.estado;
        IF total>=v.total_acordado THEN nuevo:='completado';
        ELSIF v.estado='negociado' AND ((v.modalidad->>'reglaActivacion'='primer_abono' AND total>0)
          OR (v.modalidad->>'reglaActivacion'='primera_cuota' AND primera_pagada>=primero)) THEN nuevo:='en_ejecucion'; END IF;
        IF nuevo<>v.estado THEN
          UPDATE cronograma_version SET estado=nuevo WHERE id_version=v.id_version;
          INSERT INTO cronograma_evento(id_version,tipo,detalle,id_usuario) VALUES(v.id_version,nuevo,jsonb_build_object('anterior',v.estado),coalesce(actor,v.id_autor));
        END IF;
      END $$;`);
  }
  async down() {
    throw new Error(
      'Conserva la regla de activación por la primera cuota efectiva.',
    );
  }
}
