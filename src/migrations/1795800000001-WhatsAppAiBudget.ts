import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsAppAiBudget1795800000001 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`
      CREATE TABLE whatsapp_ai_budget (
        utc_day date PRIMARY KEY,
        calls integer NOT NULL CHECK (calls > 0)
      )
    `);
  }

  async down(runner: QueryRunner) {
    await runner.query('DROP TABLE whatsapp_ai_budget');
  }
}
