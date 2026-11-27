import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { CaptureProfileService } from '../admin/capture-profile.service.js';
import type { DeliveryStatus, Incoming } from './whatsapp-webhook.schema.js';
import { sealSessionToken, unsealSessionToken, WhatsAppConfig } from './whatsapp.config.js';
import type { SendResult } from './whatsapp-cloud.client.js';

const maxAttempts = 5;
const windowMs = 24 * 60 * 60 * 1000;

export type WhatsAppJob = {
  id: string;
  session_id: string;
  phone_id: string;
  sender_id: string;
  turn_id: string;
  format: Incoming['format'];
  body: string | null;
  lease_id: string;
  attempts: number;
  contact_token: string;
  id_sesion: string;
  reply?: string;
  handoff?: boolean;
};

@Injectable()
export class WhatsAppEventsService {
  constructor(
    private readonly db: DataSource,
    private readonly capture: CaptureProfileService,
    private readonly config: WhatsAppConfig,
  ) {}

  async persist(phone: string, incoming: Incoming[], statuses: DeliveryStatus[]) {
    await this.db.transaction(async m => {
      // Lock sessions in a consistent order even when batches overlap.
      const sessions = new Map<string, string>();
      for (const sender of [...new Set(incoming.map(event => event.sender))].sort()) {
        const first = incoming.find(event => event.sender === sender)!;
        const [session] = await m.query(`
          INSERT INTO whatsapp_session(phone_id,sender_id,last_inbound_at) VALUES($1,$2,$3)
          ON CONFLICT(phone_id,sender_id) DO UPDATE SET sender_id=excluded.sender_id RETURNING id
        `, [phone, sender, first.receivedAt]);
        sessions.set(sender, session.id);
      }
      for (const event of incoming) {
        const session = sessions.get(event.sender)!;
        await m.query(`
          WITH inserted AS (
            INSERT INTO whatsapp_event(session_id,phone_id,wamid,turn_id,received_at,format,body)
            VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(phone_id,wamid) DO NOTHING RETURNING received_at
          )
          UPDATE whatsapp_session SET last_inbound_at=greatest(last_inbound_at, inserted.received_at)
          FROM inserted WHERE id=$1
        `, [session, phone, event.wamid, randomUUID(), event.receivedAt, event.format, event.body]);
      }
      for (const status of statuses) await this.reconcile(m, phone, status);
    });
  }

  private async reconcile(m: EntityManager, phone: string, status: DeliveryStatus) {
    await m.query(`
      UPDATE whatsapp_outbound o SET graph_id=coalesce(o.graph_id,$2), state='accepted',
        delivery=CASE
          WHEN o.delivery='read' OR (o.delivery='delivered' AND $3<>'read')
            OR (o.delivery='failed' AND $3='sent') THEN o.delivery
          ELSE $3 END
      FROM whatsapp_event e WHERE e.id=o.event_id AND e.phone_id=$1
        AND (o.graph_id=$2 OR (o.graph_id IS NULL AND o.correlation=$4))
        AND o.state IN ('sending','ambiguous','accepted')
    `, [phone, status.id, status.status, status.biz_opaque_callback_data ?? null]);
  }

  async claim(phone: string): Promise<WhatsAppJob | 'recovered' | undefined> {
    return this.db.transaction(async m => {
      const [candidate] = await m.query(`
        SELECT s.id FROM whatsapp_session s
        JOIN LATERAL (
          SELECT id, next_attempt_at, lease_until FROM whatsapp_event
          WHERE session_id=s.id AND state IN ('pending','processing') ORDER BY id LIMIT 1
        ) e ON true
        WHERE s.phone_id=$1 AND e.next_attempt_at<=now()
          AND (e.lease_until IS NULL OR e.lease_until<=now())
        ORDER BY e.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED
      `, [phone]);
      if (!candidate) return;
      // Re-read in a fresh statement after taking the session lock.
      const [head] = await m.query(`
        SELECT e.*, s.sender_id, s.sealed_contact_token, o.state AS outbound_state, o.reply, o.handoff
        FROM whatsapp_event e JOIN whatsapp_session s ON s.id=e.session_id
        LEFT JOIN whatsapp_outbound o ON o.event_id=e.id
        WHERE e.id=(
          SELECT id FROM whatsapp_event WHERE session_id=$1 AND state IN ('pending','processing')
          ORDER BY id LIMIT 1
        ) AND e.next_attempt_at<=clock_timestamp()
          AND (e.lease_until IS NULL OR e.lease_until<=clock_timestamp())
      `, [candidate.id]);
      if (!head) return;
      if (['sending','accepted','ambiguous'].includes(head.outbound_state)) {
        await m.query("UPDATE whatsapp_outbound SET state='ambiguous' WHERE event_id=$1 AND state='sending'", [head.id]);
        await this.finish(m, head.id, 'done');
        return 'recovered';
      }
      if (head.attempts >= maxAttempts) {
        await m.query("UPDATE whatsapp_outbound SET state='failed' WHERE event_id=$1 AND state='ready'", [head.id]);
        await this.finish(m, head.id, 'failed');
        return 'recovered';
      }

      // Persist the encrypted session token before the agent can commit a turn.
      const { sessionKey } = this.config.get();
      const scope = `${phone}:${head.session_id}`;
      const token = head.sealed_contact_token ? unsealSessionToken(head.sealed_contact_token, sessionKey, scope) : '';
      if (token) {
        await m.query("UPDATE acceso_contacto SET expires_at=now()+interval '30 days' WHERE token_hash=$1",
          [createHash('sha256').update(token).digest('hex')]);
      }
      const contact = await this.capture.session(m, token, { canal: 'whatsapp' });
      if (contact.token !== token) {
        await m.query('UPDATE whatsapp_session SET sealed_contact_token=$2 WHERE id=$1',
          [head.session_id, sealSessionToken(contact.token, sessionKey, scope)]);
      }
      const lease = randomUUID();
      await m.query(`
        UPDATE whatsapp_event SET state='processing', lease_id=$2,
          lease_until=clock_timestamp()+interval '60 seconds', attempts=attempts+1 WHERE id=$1
      `, [head.id, lease]);
      return { ...head, lease_id: lease, attempts: head.attempts + 1,
        contact_token: contact.token, id_sesion: contact.id_sesion };
    });
  }

  private async owned(m: EntityManager, job: WhatsAppJob) {
    const [session] = await m.query('SELECT id FROM whatsapp_session WHERE id=$1 FOR UPDATE', [job.session_id]);
    if (!session) return false;
    const [event] = await m.query(`
      SELECT id FROM whatsapp_event WHERE id=$1 AND lease_id=$2
        AND state='processing' AND lease_until>clock_timestamp()
    `, [job.id, job.lease_id]);
    return Boolean(event);
  }

  private async finish(m: EntityManager, id: string, state: 'done' | 'failed' | 'skipped') {
    await m.query('UPDATE whatsapp_event SET state=$2, lease_id=NULL, lease_until=NULL, body=NULL WHERE id=$1', [id, state]);
  }

  async allowed(job: WhatsAppJob, handoff = false, minimumLeaseSeconds = 0) {
    return this.checkPolicy(this.db.manager, job, handoff, minimumLeaseSeconds);
  }

  private async checkPolicy(m: EntityManager, job: WhatsAppJob, handoff: boolean, minimumLeaseSeconds = 0) {
    const [row] = await m.query(`
      SELECT s.last_inbound_at, clock_timestamp() AS checked_at, c.estado,
        (e.lease_id=$3 AND e.lease_until>clock_timestamp()+$4*interval '1 second') AS leased,
        EXISTS (
          SELECT 1 FROM agente_solicitud a WHERE a.id_conversacion=c.id_conversacion AND a.estado='en_atencion'
        ) AS advisor
      FROM whatsapp_session s JOIN whatsapp_event e ON e.session_id=s.id AND e.id=$2
      LEFT JOIN conversacion c ON c.id_sesion=$1 AND c.cerrada_en IS NULL
      WHERE s.id=e.session_id
    `, [job.id_sesion, job.id, job.lease_id, minimumLeaseSeconds]);
    return Boolean(row?.leased && +row.checked_at - +row.last_inbound_at < windowMs
      && !row.advisor && (row.estado !== 'derivada' || handoff));
  }

  async skip(job: WhatsAppJob) {
    await this.db.transaction(async m => {
      if (!await this.owned(m, job)) return;
      await m.query("UPDATE whatsapp_outbound SET state='skipped' WHERE event_id=$1 AND state='ready'", [job.id]);
      await this.finish(m, job.id, 'skipped');
    });
  }

  async prepare(job: WhatsAppJob, reply: string, handoff: boolean) {
    return this.db.transaction(async m => {
      if (!await this.owned(m, job)) return;
      const [outbound] = await m.query(`
        INSERT INTO whatsapp_outbound(event_id,correlation,reply,handoff,state)
        VALUES($1,$2,$3,$4,'ready') ON CONFLICT(event_id) DO UPDATE SET event_id=excluded.event_id
        RETURNING correlation, reply, handoff, state
      `, [job.id, job.turn_id, reply, handoff]);
      return outbound as { correlation: string; reply: string; handoff: boolean; state: string };
    });
  }

  async startSend(job: WhatsAppJob, handoff: boolean) {
    return this.db.transaction(async m => {
      if (!await this.owned(m, job)) return false;
      // Serialize this decision with the existing human-takeover transaction.
      await m.query('SELECT id_conversacion FROM conversacion WHERE id_sesion=$1 AND cerrada_en IS NULL FOR UPDATE', [job.id_sesion]);
      if (!await this.checkPolicy(m, job, handoff, 12)) return false;
      const [changed] = await m.query(`
        WITH updated AS (
          UPDATE whatsapp_outbound SET state='sending' WHERE event_id=$1 AND state='ready' RETURNING event_id
        ) SELECT event_id FROM updated
      `, [job.id]);
      return Boolean(changed);
    });
  }

  async settle(job: WhatsAppJob, result: SendResult) {
    await this.db.transaction(async m => {
      if (!await this.owned(m, job)) return;
      const [existing] = await m.query('SELECT state FROM whatsapp_outbound WHERE event_id=$1 FOR UPDATE', [job.id]);
      const canRetry = result.kind === 'retry' && job.attempts < maxAttempts;
      if (existing?.state === 'accepted') {
        await this.finish(m, job.id, 'done');
      } else if (canRetry) {
        await m.query("UPDATE whatsapp_outbound SET state='ready' WHERE event_id=$1 AND state='sending'", [job.id]);
        await m.query(`
          UPDATE whatsapp_event SET state='pending',lease_id=NULL,lease_until=NULL,
            next_attempt_at=now()+$2*interval '1 second' WHERE id=$1
        `, [job.id, 2 ** job.attempts]);
      } else {
        const state = result.kind === 'accepted' || result.kind === 'ambiguous' ? result.kind : 'failed';
        await m.query("UPDATE whatsapp_outbound SET state=$2,graph_id=$3 WHERE event_id=$1 AND state='sending'",
          [job.id, state, result.kind === 'accepted' ? result.id : null]);
        await this.finish(m, job.id, state === 'failed' ? 'failed' : 'done');
      }
    });
  }
}
