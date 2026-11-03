import type { MigrationInterface, QueryRunner } from 'typeorm';
export class PaymentLegacyChecks1792910000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(
      "CREATE UNIQUE INDEX pago_regularizacion_unica ON pago_evento(id_pago) WHERE tipo='regularizacion'",
    );
    const [{ definition }] = await q.query(
      "SELECT pg_get_functiondef('cronograma_validar_pago()'::regprocedure) AS definition",
    );
    await q.query(
      definition.replace(
        'IF NEW.id_cuota IS NULL THEN',
        `
      IF NEW.estado='confirmado' THEN
        IF NEW.metodo IS NULL OR NEW.fecha_pago IS NULL OR NEW.fecha_pago>now()+interval '1 minute' OR NEW.monto<=0 THEN
          RAISE EXCEPTION 'El pago requiere importe, método y fecha válidos; conserva el original y registra un reemplazo' USING ERRCODE='23514';
        END IF;
        IF EXISTS(SELECT 1 FROM pago_evento WHERE id_pago=NEW.id_pago AND tipo='regularizacion' AND id_usuario=NEW.id_verificador) THEN
          RAISE EXCEPTION 'No se verifica la propia regularización' USING ERRCODE='23514';
        END IF;
        IF NEW.id_cuota IS NULL AND EXISTS(SELECT 1 FROM cronograma_pago WHERE id_contrato=NEW.id_contrato) THEN
          RAISE EXCEPTION 'El cronograma ya reconoce los cobros; rechaza el pendiente histórico y registra un reemplazo en su cuota' USING ERRCODE='23514';
        END IF;
      END IF;
      IF NEW.id_cuota IS NULL THEN`,
      ),
    );
  }
  async down() {
    throw new Error(
      'Conserva la separación de funciones y las validaciones de pagos históricos.',
    );
  }
}
