import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AgentOrchestration1793100000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    // Enum values are added in this transaction, but first used by application code after commit.
    for (const role of ['cobranza','academico','postventa']) await q.query(`ALTER TYPE tipo_agente ADD VALUE IF NOT EXISTS '${role}'`);
    await q.query(`
      ALTER TABLE turno_tesi ADD COLUMN motor varchar(16) NOT NULL DEFAULT 'legacy';
      ALTER TABLE conversacion ADD COLUMN agente_turno uuid;
      ALTER TABLE conversacion ADD COLUMN agente_reserva uuid;
      ALTER TABLE conversacion ADD COLUMN agente_expira timestamptz;
      CREATE TABLE agente_ejecucion (
        id_turno uuid PRIMARY KEY REFERENCES turno_tesi(id_turno),
        agente varchar(30), version varchar(30), estado varchar(20) NOT NULL,
        duracion_ms int, actualizado_en timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE agente_solicitud (
        id_solicitud bigserial PRIMARY KEY,
        id_turno uuid NOT NULL REFERENCES turno_tesi(id_turno),
        id_conversacion bigint NOT NULL REFERENCES conversacion(id_conversacion),
        agente varchar(30) NOT NULL, contenido text NOT NULL,
        estado varchar(20) NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','en_atencion','resuelta')),
        id_responsable int REFERENCES usuario_interno(id_usuario),
        revision int NOT NULL DEFAULT 1, creada_en timestamptz NOT NULL DEFAULT now(),
        UNIQUE(id_turno,agente)
      );
      CREATE TABLE agente_evento (
        id_evento bigserial PRIMARY KEY, id_conversacion bigint REFERENCES conversacion(id_conversacion),
        id_usuario int NOT NULL REFERENCES usuario_interno(id_usuario), accion varchar(40) NOT NULL,
        fecha timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE agente_recordatorio (
        id_recordatorio bigserial PRIMARY KEY, id_cuota int NOT NULL REFERENCES cuota_pago(id_cuota),
        regla varchar(30) NOT NULL DEFAULT 'vencida-v1',
        estado varchar(20) NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','revisado','obsoleto')),
        texto text NOT NULL, id_revisor int REFERENCES usuario_interno(id_usuario),
        creado_en timestamptz NOT NULL DEFAULT now(), UNIQUE(id_cuota,regla)
      );
    `);
  }
  async down() { throw new Error('Migración aditiva: conservar historial y desactivar AGENTS_ENABLED para revertir el recorrido.'); }
}
