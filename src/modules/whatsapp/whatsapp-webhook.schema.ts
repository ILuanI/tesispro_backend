import { z } from 'zod';
import { senderId } from './whatsapp.config.js';

const message = z.object({
  id: z.string().min(1).max(512),
  from: z.string().regex(senderId).optional(),
  from_user_id: z.string().regex(senderId).optional(),
  timestamp: z.string().regex(/^\d{1,11}$/),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
});
const status = z.object({
  id: z.string().min(1).max(512),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  biz_opaque_callback_data: z.uuid().optional().catch(undefined),
});
const envelope = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({
    changes: z.array(z.object({ field: z.string(), value: z.unknown() })),
  })),
});
const valueSchema = z.object({
  metadata: z.object({ phone_number_id: z.string() }),
  messages: z.array(z.unknown()).default([]),
  statuses: z.array(z.unknown()).default([]),
});

export type DeliveryStatus = z.infer<typeof status>;
export type Incoming = {
  wamid: string;
  sender: string;
  receivedAt: Date;
  body: string | null;
  format: 'text' | 'too_long' | 'unsupported';
};

function asRecord(value: unknown) {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export function parseWebhook(body: unknown, phone: string, allowed: string[], now = Date.now()) {
  const payload = envelope.safeParse(body);
  if (!payload.success) return null;
  const diagnostics = {
    received: 0,
    senderFields: { fromOnly: 0, fromUserIdOnly: 0, both: 0, neither: 0 },
    senderMatches: { from: 0, fromUserId: 0, either: 0 },
    receiver: { matched: 0, mismatch: 0, missingOrInvalid: 0 },
    discarded: {
      ignoredField: 0, invalidChange: 0, wrongPhone: 0, invalidMessage: 0,
      missingSender: 0, senderNotAllowed: 0, timestampZero: 0, timestampInFuture: 0,
      invalidStatus: 0,
    },
  };
  const incoming: Incoming[] = [];
  const statuses: DeliveryStatus[] = [];
  for (const entry of payload.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') {
        diagnostics.discarded.ignoredField++;
        continue;
      }
      const rawValue = asRecord(change.value);
      const phoneId = asRecord(rawValue.metadata).phone_number_id;
      const candidates = Array.isArray(rawValue.messages) ? rawValue.messages : [];
      diagnostics.received += candidates.length;
      for (const candidate of candidates) {
        const { from, from_user_id } = asRecord(candidate);
        const presence = from !== undefined
          ? from_user_id !== undefined ? 'both' : 'fromOnly'
          : from_user_id !== undefined ? 'fromUserIdOnly' : 'neither';
        diagnostics.senderFields[presence]++;
        const phoneMatches = typeof from === 'string' && allowed.includes(from);
        const userMatches = typeof from_user_id === 'string' && allowed.includes(from_user_id);
        if (phoneMatches) diagnostics.senderMatches.from++;
        if (userMatches) diagnostics.senderMatches.fromUserId++;
        if (phoneMatches || userMatches) diagnostics.senderMatches.either++;
      }
      if (typeof phoneId !== 'string') diagnostics.receiver.missingOrInvalid++;
      else if (phoneId === phone) diagnostics.receiver.matched++;
      else diagnostics.receiver.mismatch++;
      const value = valueSchema.safeParse(change.value);
      if (!value.success) {
        diagnostics.discarded.invalidChange++;
        continue;
      }
      if (value.data.metadata.phone_number_id !== phone) {
        diagnostics.discarded.wrongPhone++;
        continue;
      }
      for (const raw of value.data.messages) {
        const parsed = message.safeParse(raw);
        if (!parsed.success) {
          diagnostics.discarded.invalidMessage++;
          continue;
        }
        const data = parsed.data;
        const sender = [data.from_user_id, data.from].find(value => value && allowed.includes(value));
        const time = Number(data.timestamp) * 1000;
        if (!sender) {
          diagnostics.discarded[data.from || data.from_user_id ? 'senderNotAllowed' : 'missingSender']++;
          continue;
        }
        if (time < 1 || time > now + 60_000) {
          diagnostics.discarded[time < 1 ? 'timestampZero' : 'timestampInFuture']++;
          continue;
        }
        const body = data.type === 'text' ? data.text?.body.trim() : undefined;
        const format = !body ? 'unsupported' : body.length > 800 ? 'too_long' : 'text';
        incoming.push({
          wamid: data.id, sender, receivedAt: new Date(Math.min(time, now)),
          body: format === 'text' ? body! : null, format,
        });
      }
      for (const raw of value.data.statuses) {
        const parsed = status.safeParse(raw);
        if (parsed.success) statuses.push(parsed.data);
        else diagnostics.discarded.invalidStatus++;
      }
    }
  }
  return { incoming, statuses, diagnostics };
}
