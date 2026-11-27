import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { WhatsAppConfig } from './whatsapp.config.js';

export type SendResult =
  | { kind: 'accepted'; id: string }
  | { kind: 'retry' | 'failed' | 'ambiguous' };

const responseSchema = z.object({ messages: z.array(z.object({ id: z.string().min(1).max(512) })).length(1) });
const errorSchema = z.object({ error: z.object({ code: z.number() }) });

@Injectable()
export class WhatsAppCloudClient {
  constructor(private readonly config: WhatsAppConfig) {}

  async send(recipient: string, body: string, correlation: string): Promise<SendResult> {
    const { version, phone, accessToken, messagingAccount } = this.config.get();
    const isScopedId = recipient.includes('.');
    try {
      const response = await fetch(`https://graph.facebook.com/${version}/${phone}/messages`, {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          ...(isScopedId ? { recipient } : { to: `+${recipient}` }),
          ...(messagingAccount ? { messaging_account_id: messagingAccount } : {}),
          type: 'text',
          text: { body, preview_url: false },
          biz_opaque_callback_data: correlation,
        }),
      });
      if (response.status === 429) return { kind: 'retry' };
      if (response.status === 408 || response.status >= 500) return { kind: 'ambiguous' };
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error = errorSchema.safeParse(payload);
        if (error.success && [4, 130429, 131056].includes(error.data.error.code)) return { kind: 'retry' };
        return error.success ? { kind: 'failed' } : { kind: 'ambiguous' };
      }
      const result = responseSchema.safeParse(payload);
      return result.success ? { kind: 'accepted', id: result.data.messages[0].id } : { kind: 'ambiguous' };
    } catch {
      return { kind: 'ambiguous' };
    }
  }
}
