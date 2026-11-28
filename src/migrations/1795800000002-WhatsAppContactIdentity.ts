import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El sender_id de WhatsApp pasa a ser el identificador principal del contacto:
 * cada sesión (número del negocio + sender_id) queda vinculada a un buyer o lead.
 * El teléfono se guarda aparte porque Meta puede enviar un ID de usuario sin número.
 */
export class WhatsAppContactIdentity1795800000002 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`
      ALTER TABLE whatsapp_session
        ADD COLUMN phone_number text CHECK (phone_number ~ '^[+][1-9][0-9]{7,14}$'),
        ADD COLUMN id_buyer bigint REFERENCES buyer(id_buyer) ON DELETE SET NULL,
        ADD COLUMN id_lead bigint REFERENCES lead(id_lead) ON DELETE SET NULL;
      CREATE INDEX whatsapp_session_lead ON whatsapp_session(id_lead) WHERE id_lead IS NOT NULL;
      CREATE INDEX whatsapp_session_buyer ON whatsapp_session(id_buyer) WHERE id_buyer IS NOT NULL;
    `);
  }

  async down(runner: QueryRunner) {
    await runner.query(`
      DROP INDEX whatsapp_session_buyer, whatsapp_session_lead;
      ALTER TABLE whatsapp_session DROP COLUMN id_lead, DROP COLUMN id_buyer, DROP COLUMN phone_number;
    `);
  }
}
