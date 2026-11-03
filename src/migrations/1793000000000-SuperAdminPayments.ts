import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SuperAdminPayments1793000000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    const updateFunction = async (name: string, changes: [string, string][]) => {
      const [{ definition }] = await q.query(
        'SELECT pg_get_functiondef($1::regprocedure) AS definition', [`${name}()`],
      );
      let sql: string = definition;
      for (const [before, after] of changes) {
        if (!sql.includes(before)) throw new Error(`Unexpected definition of ${name}: ${before}`);
        sql = sql.replace(before, after);
      }
      await q.query(sql);
    };
    await updateFunction('cronograma_validar_pago', [
      ["registrador.rol IS DISTINCT FROM 'asesor_comercial'", "coalesce(registrador.rol::text,'') NOT IN ('asesor_comercial','administrador')"],
      [' OR NEW.id_verificador=NEW.id_usuario_registro', ''],
      [" AND id_usuario<>NEW.id_verificador", ''],
      ["IF EXISTS(SELECT 1 FROM pago_evento WHERE id_pago=NEW.id_pago AND tipo='regularizacion' AND id_usuario=NEW.id_verificador) THEN", "IF verificador.rol IS DISTINCT FROM 'administrador' AND EXISTS(SELECT 1 FROM pago_evento WHERE id_pago=NEW.id_pago AND tipo='regularizacion' AND id_usuario=NEW.id_verificador) THEN"],
    ]);
    await updateFunction('rectificacion_validar', [
      ["actor.rol IS DISTINCT FROM 'asesor_comercial'", "coalesce(actor.rol::text,'') NOT IN ('asesor_comercial','administrador')"],
      [' OR NEW.id_verificador=NEW.id_solicitante OR NEW.id_verificador=original.id_usuario_registro', ''],
    ]);
    // Role checks remain in the trigger; administrators may decide their own requests.
    const constraints = await q.query(`SELECT conname FROM pg_constraint
      WHERE conrelid='pago_rectificacion'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%id_solicitante%id_verificador%'`);
    for (const { conname } of constraints) {
      await q.query(`ALTER TABLE pago_rectificacion DROP CONSTRAINT "${conname.replaceAll('"', '""')}"`);
    }
  }
  async down() {
    throw new Error('Revisa los movimientos del administrador antes de restablecer la separación de funciones.');
  }
}
