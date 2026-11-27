import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';

const id = /^\d{1,32}$/;
export const senderId = /^(?:\d{5,20}|[A-Z]{2}\.[A-Za-z0-9_-]{1,100})$/;
const settings = z.object({
  phone: z.string().regex(id),
  messagingAccount: z.string().regex(id).optional(),
  accessToken: z.string().min(1),
  appSecret: z.string().min(1),
  verifyToken: z.string().min(32),
  version: z.string().regex(/^v[1-9]\d*\.0$/),
  allowed: z.array(z.string().regex(senderId)).min(1),
  workerSecret: z.string().min(32),
  aiMode: z.enum(['off', 'simulate', 'live']),
  aiDailyLimit: z.coerce.number().int().min(0).max(1000),
  aiOutputTokens: z.coerce.number().int().min(64).max(512),
  aiTimeoutMs: z.coerce.number().int().min(1000).max(10000),
  sessionKey: z.base64().transform(value => Buffer.from(value, 'base64')).refine(key => key.length === 32),
});

export function sameSecret(value: string, expected: string) {
  const hash = (input: string) => createHash('sha256').update(input).digest();
  return timingSafeEqual(hash(value), hash(expected));
}

export function sealSessionToken(token: string, key: Buffer, scope: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv).setAAD(Buffer.from(scope));
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function unsealSessionToken(sealed: string, key: Buffer, scope: string) {
  const bytes = Buffer.from(sealed, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
    .setAAD(Buffer.from(scope)).setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

@Injectable()
export class WhatsAppConfig {
  get() {
    if (process.env.WHATSAPP_ENABLED !== 'true') throw new NotFoundException();
    const result = settings.safeParse({
      phone: process.env.WHATSAPP_PHONE_NUMBER_ID,
      messagingAccount: process.env.WHATSAPP_MESSAGING_ACCOUNT_ID || undefined,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      appSecret: process.env.WHATSAPP_APP_SECRET,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
      version: process.env.WHATSAPP_GRAPH_API_VERSION || 'v27.0',
      allowed: (process.env.WHATSAPP_ALLOWED_SENDERS || '').split(',').map(value => value.trim()).filter(Boolean),
      workerSecret: process.env.WHATSAPP_WORKER_SECRET,
      aiMode: process.env.WHATSAPP_AI_MODE ?? 'off',
      aiDailyLimit: process.env.WHATSAPP_AI_DAILY_LIMIT ?? 10,
      aiOutputTokens: process.env.WHATSAPP_AI_OUTPUT_TOKENS ?? 128,
      aiTimeoutMs: process.env.WHATSAPP_AI_TIMEOUT_MS ?? 5000,
      sessionKey: process.env.WHATSAPP_SESSION_KEY,
    });
    if (!result.success) throw new ServiceUnavailableException('Configuración de WhatsApp incompleta.');
    return result.data;
  }
}
