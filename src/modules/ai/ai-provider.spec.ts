import { describe, it, expect, vi } from 'vitest';
import { aiEnvironment, structuredAI, AIProviderError } from './ai-provider.js';

const keys = { OPENROUTER_API_KEY: 'or-key', GROQ_API_KEY: 'groq-key', GEMINI_API_KEY: 'gem-key' };
const chat = (content: string, finish_reason = 'stop') => Response.json({ choices: [{ finish_reason, message: { content } }] });
const schema = { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' } }, required: ['ok'] };

describe('Cadena de proveedores', () => {
  it('usa AI_PROVIDER_ORDER con el modelo de cada proveedor; el resto son respaldos', () => {
    const options = aiEnvironment({ ...keys, AI_PROVIDER_ORDER: 'openrouter,groq,gemini', OPENROUTER_MODEL: 'meta-llama/llama-3.3-70b-instruct:free', GROQ_MODEL: 'openai/gpt-oss-120b' });
    expect([options, ...options.fallbacks!].map(o => `${o.provider}:${o.model}`)).toEqual([
      'openrouter:meta-llama/llama-3.3-70b-instruct:free', 'groq:openai/gpt-oss-120b', 'gemini:gemini-3.8-flash',
    ]);
  });
  it('basta con una clave y un modelo para todos los agentes', () => {
    const options = aiEnvironment({ GROQ_API_KEY: 'k', GROQ_MODEL: 'openai/gpt-oss-120b' });
    expect(options).toMatchObject({ provider: 'groq', model: 'openai/gpt-oss-120b', fallbacks: [] });
  });
  it('omite proveedores sin clave, sin modelo, repetidos o desconocidos', () => {
    const options = aiEnvironment({ GEMINI_API_KEY: 'k', OPENROUTER_API_KEY: 'k', AI_PROVIDER_ORDER: 'openai,cursor,openrouter,gemini,gemini' });
    expect(options.provider).toBe('gemini');
    expect(options.fallbacks).toEqual([]);
    expect(aiEnvironment({}).apiKey).toBe('');
  });
});

describe('Llamadas a proveedores', () => {
  it('OpenRouter recibe esquema estricto, clave solo en cabecera y exige parámetros', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(chat('```json\n{"ok":true}\n```'));
    await expect(structuredAI('reglas', '{"m":1}', schema, 'prueba', { provider: 'openrouter', apiKey: 'secret', model: 'org/m', fetchImpl })).resolves.toEqual({ ok: true });
    const [url, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init!.body));
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect(String(init!.body)).not.toContain('secret');
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'prueba', strict: true, schema } });
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user']);
  });
  it('Groq usa su endpoint y max_completion_tokens', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(chat('{"ok":true}'));
    await structuredAI('r', '{}', schema, 'x', { provider: 'groq', apiKey: 'k', model: 'openai/gpt-oss-120b', maxOutputTokens: 64, fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(JSON.parse(String(init!.body)).max_completion_tokens).toBe(64);
  });
  it('pasa al siguiente proveedor ante cuota, crédito o error de solicitud', async () => {
    const first = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { message: 'no credits' } }, { status: 402 }));
    const second = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: {} }, { status: 400 }));
    const third = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] }));
    await expect(structuredAI('r', '{}', schema, 'x', { provider: 'openrouter', apiKey: 'k', model: 'a/b', fetchImpl: first, fallbacks: [
      { provider: 'groq', apiKey: 'k', model: 'c', fetchImpl: second }, { provider: 'gemini', apiKey: 'k', model: 'gemini-x', fetchImpl: third },
    ] })).resolves.toEqual({ ok: true });
    expect(third).toHaveBeenCalledOnce();
  });
  it('un rechazo del modelo no se reintenta con otro proveedor', async () => {
    const alternate = vi.fn<typeof fetch>();
    const refusal = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'no' } }] }));
    await expect(structuredAI('r', '{}', schema, 'x', { provider: 'groq', apiKey: 'k', model: 'm', fetchImpl: refusal, fallbacks: [{ provider: 'gemini', apiKey: 'k', fetchImpl: alternate }] })).rejects.toThrow('declined');
    expect(alternate).not.toHaveBeenCalled();
  });
  it('clasifica errores sin conservar el mensaje del proveedor y rechaza respuestas incompletas', async () => {
    const error = await structuredAI('r', '{}', schema, 'x', { provider: 'groq', apiKey: 'k', model: 'm', fetchImpl: async () => Response.json({ error: { message: 'limit: 30 secret' } }, { status: 429 }) }).catch((e: unknown) => e) as AIProviderError;
    expect(error).toBeInstanceOf(AIProviderError);
    expect(error.category).toBe('quota');
    expect(error.message).not.toContain('secret');
    await expect(structuredAI('r', '{}', schema, 'x', { provider: 'groq', apiKey: 'k', model: 'm', fetchImpl: async () => chat('{"ok":', 'length') })).rejects.toThrow('Incomplete');
    await expect(structuredAI('r', '{}', schema, 'x', { provider: 'gemini', apiKey: 'k', model: '../x', fetchImpl: vi.fn() })).rejects.toThrow('model');
  });
});
