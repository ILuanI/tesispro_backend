import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ContractServices1792060000000 implements MigrationInterface {
  name = 'ContractServices1792060000000';
  async up(q: QueryRunner): Promise<void> {
    // Los importes se acuerdan en cada contrato; cero no es una tarifa pública.
    await q.query(`INSERT INTO servicio(codigo,nombre,modelo_cobro,precio_base,moneda) VALUES
      ('puntual','Asesoría Puntual','pago_unico',0,'PEN'),
      ('etapas','Acompañamiento por Etapas','por_etapa',0,'PEN'),
      ('integral','Asesoría Integral 360°','pago_unico',0,'PEN')
      ON CONFLICT(codigo) DO NOTHING`);
  }
  async down(): Promise<void> {
    // Conservar el catálogo: puede tener referencias y modificaciones comerciales.
  }
}
