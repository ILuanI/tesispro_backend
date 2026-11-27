import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppCloudClient } from './whatsapp-cloud.client.js';
import type { WhatsAppConfig } from './whatsapp.config.js';

describe('WhatsApp Cloud API client with simulated HTTP', () => {
  const client = new WhatsAppCloudClient({
    get: () => ({ version: 'v27.0', phone: '12345', accessToken: 'synthetic' }),
  } as WhatsAppConfig);
  afterEach(() => vi.unstubAllGlobals());

  it('uses the configured Graph version and number, sending only correlated free-form text', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ messages: [{ id: 'out-1' }] }));
    vi.stubGlobal('fetch', fetch);
    expect(await client.send('10000000001', 'Hola', 'correlation')).toEqual({ kind: 'accepted', id: 'out-1' });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v27.0/12345/messages');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toEqual({ messaging_product: 'whatsapp', recipient_type: 'individual',
      to: '+10000000001', type: 'text', text: { body: 'Hola', preview_url: false },
      biz_opaque_callback_data: 'correlation' });
  });

  it('distinguishes definite rejection and throttling from a possibly accepted send', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { code: 10 } }, { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({}))
      .mockRejectedValueOnce(new DOMException('synthetic timeout', 'TimeoutError'));
    vi.stubGlobal('fetch', fetch);
    const attempts = [];
    for (let n = 0; n < 5; n++) attempts.push((await client.send('10000000001', 'Hola', 'ref')).kind);
    expect(attempts).toEqual(['failed', 'retry', 'ambiguous', 'ambiguous', 'ambiguous']);
  });
});
