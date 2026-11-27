import type { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsAppChannel1795800000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`
      CREATE TABLE whatsapp_session (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        phone_id text NOT NULL,
        sender_id text NOT NULL,
        last_inbound_at timestamptz NOT NULL,
        sealed_contact_token text,
        UNIQUE(phone_id, sender_id)
      );
      CREATE TABLE whatsapp_event (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        session_id bigint NOT NULL REFERENCES whatsapp_session(id),
        phone_id text NOT NULL,
        wamid text NOT NULL,
        turn_id uuid NOT NULL UNIQUE,
        received_at timestamptz NOT NULL,
        format text NOT NULL CHECK (format IN ('text','too_long','unsupported')),
        body text,
        state text NOT NULL DEFAULT 'pending'
          CHECK (state IN ('pending','processing','done','failed','skipped')),
        attempts int NOT NULL DEFAULT 0,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        lease_id uuid,
        lease_until timestamptz,
        UNIQUE(phone_id, wamid)
      );
      CREATE INDEX whatsapp_event_session_pending ON whatsapp_event(session_id, id)
        WHERE state IN ('pending','processing');
      CREATE TABLE whatsapp_outbound (
        event_id bigint PRIMARY KEY REFERENCES whatsapp_event(id),
        correlation uuid NOT NULL UNIQUE,
        reply text NOT NULL,
        handoff boolean NOT NULL DEFAULT false,
        state text NOT NULL CHECK (state IN ('ready','sending','accepted','ambiguous','failed','skipped')),
        graph_id text UNIQUE,
        delivery text CHECK (delivery IN ('sent','delivered','read','failed'))
      );
    `);
  }

  async down(runner: QueryRunner) {
    await runner.query('DROP TABLE whatsapp_outbound, whatsapp_event, whatsapp_session');
  }
}
