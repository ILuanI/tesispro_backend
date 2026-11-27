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

export function parseWebhook(body: unknown, phone: string, allowed: string[], now = Date.now()) {
  const payload = envelope.safeParse(body);
  if (!payload.success) return null;
  const incoming: Incoming[] = [];
  const statuses: DeliveryStatus[] = [];
  for (const entry of payload.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const value = valueSchema.safeParse(change.value);
      if (!value.success || value.data.metadata.phone_number_id !== phone) continue;
      for (const raw of value.data.messages) {
        const parsed = message.safeParse(raw);
        if (!parsed.success) continue;
        const data = parsed.data;
        const sender = [data.from_user_id, data.from].find(value => value && allowed.includes(value));
        const time = Number(data.timestamp) * 1000;
        if (!sender || time < 1 || time > now + 60_000) continue;
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
      }
    }
  }
  return { incoming, statuses };
}
