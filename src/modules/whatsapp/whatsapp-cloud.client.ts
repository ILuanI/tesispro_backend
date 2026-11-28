import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { WhatsAppConfig } from './whatsapp.config.js';

export type SendResult =
  | { kind: 'accepted'; id: string }
  | { kind: 'retry' | 'failed' | 'ambiguous' };

const responseSchema = z.object({ messages: z.array(z.object({ id: z.string().min(1).max(512) })).length(1) });
const errorSchema = z.object({
  error: z.object({
    code: z.number(),
    error_subcode: z.number().optional(),
    type: z.string().max(100).optional(),
    fbtrace_id: z.string().max(100).optional(),
  }),
});

@Injectable()
export class WhatsAppCloudClient {
  private readonly logger = new Logger(WhatsAppCloudClient.name);
  constructor(private readonly config: WhatsAppConfig) {}

  /** Diagnóstico sin datos personales: solo estado HTTP y códigos de Meta. */
  private report(outcome: SendResult['kind'], detail: Record<string, unknown>) {
    const entry = { event: 'whatsapp_send', outcome, ...detail };
    if (outcome === 'accepted') this.logger.log(entry);
    else this.logger.warn(entry);
  }

  async send(recipient: string, body: string, correlation: string): Promise<SendResult> {
    const { version, phone, accessToken, messagingAccount } = this.config.get();
    const isScopedId = recipient.includes('.');
    let status: number | undefined;
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
      status = response.status;
      const payload: unknown = await response.json().catch(() => undefined);
      const error = errorSchema.safeParse(payload);
      const meta = error.success
        ? { metaCode: error.data.error.code, metaSubcode: error.data.error.error_subcode, metaType: error.data.error.type, fbtrace: error.data.error.fbtrace_id }
        : {};
      if (status === 429) return this.result('retry', { status, ...meta });
      if (status === 408 || status >= 500) return this.result('ambiguous', { status, ...meta });
      if (!response.ok) {
        if (error.success && [4, 130429, 131056].includes(error.data.error.code)) return this.result('retry', { status, ...meta });
        return this.result(error.success ? 'failed' : 'ambiguous', { status, ...meta, ...(error.success ? {} : { reason: 'unparseable_error' }) });
      }
      const result = responseSchema.safeParse(payload);
      if (!result.success) return this.result('ambiguous', { status, reason: 'unexpected_success_body' });
      this.report('accepted', { status });
      return { kind: 'accepted', id: result.data.messages[0].id };
    } catch (error) {
      return this.result('ambiguous', { status, reason: 'request_error', exception: error instanceof Error ? error.name : 'unknown' });
    }
  }

  private result(kind: 'retry' | 'failed' | 'ambiguous', detail: Record<string, unknown>): SendResult {
    this.report(kind, detail);
    return { kind };
  }
}
