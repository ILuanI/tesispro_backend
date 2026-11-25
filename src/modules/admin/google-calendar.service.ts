import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { OAuth2Client } from 'google-auth-library';
import { calendar, type calendar_v3 } from '@googleapis/calendar';

export const calendarScopes = [
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.calendars.readonly',
];
export function googleCode(error: any): number { return Number(error?.response?.status || error?.code || 0); }
export function safeCalendarError(error: any) {
  const code = googleCode(error);
  if (error?.response?.data?.error === 'invalid_grant' || code === 401)
    return 'La autorización de Google venció o fue revocada. Reconecta la cuenta.';
  if (code === 403) return 'Google rechazó el acceso. Revisa permisos y cuotas del calendario.';
  if (code === 429) return 'Google está limitando las solicitudes. Reintenta en unos momentos.';
  if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) return error.message;
  return 'No se pudo verificar la operación con Google. Reintenta la misma solicitud o actualiza el calendario.';
}
export function encryptCalendarToken(value: string, secret: string) {
  const key = Buffer.from(secret, 'base64');
  if (key.length !== 32) throw new ServiceUnavailableException('Configura GOOGLE_TOKEN_ENCRYPTION_KEY con 32 bytes en base64.');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(b => b.toString('base64')).join('.');
}
export function decryptCalendarToken(value: string, secret: string) {
  const [iv, tag, data] = value.split('.').map(v => Buffer.from(v, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(secret, 'base64'), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString('utf8');
}

@Injectable()
export class GoogleCalendarService {
  constructor(private readonly db: DataSource) {}
  private oauth() {
    const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret, GOOGLE_REDIRECT_URI: redirect } = process.env;
    if (!id || !secret || !redirect) throw new ServiceUnavailableException('Configura las credenciales OAuth de Google en el backend.');
    return new OAuth2Client(id, secret, redirect);
  }
  private key() { return process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || ''; }
  async connection() {
    const [row] = await this.db.query('SELECT * FROM google_calendar_connection WHERE id=1');
    return row;
  }
  async status() {
    const row = await this.connection();
    return { configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && this.key()),
      connected: !!row, calendarId: row?.calendar_id || process.env.GOOGLE_CALENDAR_ID || '', redirectUri: process.env.GOOGLE_REDIRECT_URI || '' };
  }
  async authorize(user: number) {
    encryptCalendarToken('validate', this.key());
    const client = this.oauth(), state = randomBytes(32).toString('hex');
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    await this.db.query('DELETE FROM google_calendar_oauth WHERE expires_at<now()');
    await this.db.query("INSERT INTO google_calendar_oauth(state_hash,id_usuario,verifier,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
      [createHash('sha256').update(state).digest('hex'), user, codeVerifier]);
    return { url: client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: calendarScopes, state,
      code_challenge: codeChallenge, code_challenge_method: 'S256' as any }) };
  }
  async callback(state: string, code: string, denied?: string) {
    if (!/^[a-f0-9]{64}$/.test(state || '')) throw new BadRequestException('Estado OAuth inválido.');
    const rows = await this.db.query(`DELETE FROM google_calendar_oauth WHERE state_hash=$1 AND expires_at>now()
      RETURNING *`, [createHash('sha256').update(state).digest('hex')]);
    const row = rows[0]?.[0] || rows[0]; // PostgreSQL/TypeORM DELETE RETURNING varies by driver version.
    if (!row?.id_usuario) throw new BadRequestException('La autorización venció o ya fue utilizada.');
    const [admin] = await this.db.query("SELECT 1 FROM usuario_interno WHERE id_usuario=$1 AND activo=true AND rol='administrador'", [row.id_usuario]);
    if (!admin || denied || !code) throw new BadRequestException('No se autorizó la conexión con Google.');
    const client = this.oauth();
    const { tokens } = await client.getToken({ code, codeVerifier: row.verifier });
    if (!tokens.refresh_token) throw new BadRequestException('Google no entregó acceso offline. Vuelve a conectar con consentimiento.');
    const granted = new Set((tokens.scope || '').split(' '));
    if (!calendarScopes.every(s => granted.has(s))) throw new BadRequestException('Debes conceder los permisos de calendario solicitados.');
    await this.db.query(`INSERT INTO google_calendar_connection(id,refresh_token,calendar_id) VALUES(1,$1,$2)
      ON CONFLICT(id) DO UPDATE SET refresh_token=excluded.refresh_token,updated_at=now()`,
      [encryptCalendarToken(tokens.refresh_token, this.key()), process.env.GOOGLE_CALENDAR_ID || null]);
  }
  async client(): Promise<{ api: calendar_v3.Calendar; calendarId: string }> {
    const row = await this.connection();
    const calendarId = row?.calendar_id || process.env.GOOGLE_CALENDAR_ID;
    if (!row) throw new ServiceUnavailableException('El calendario aún no está conectado. Un administrador debe configurar Google Calendar.');
    if (!calendarId) throw new ServiceUnavailableException('La agenda aún no está habilitada. Un administrador debe guardar el ID del calendario de citas.');
    const auth = this.oauth();
    try { auth.setCredentials({ refresh_token: decryptCalendarToken(row.refresh_token, this.key()) }); }
    catch { throw new ServiceUnavailableException('No se pudo leer la autorización de Google. Revisa la clave de cifrado.'); }
    return { api: calendar({ version: 'v3', auth, retry: true,
      retryConfig: { retry: 1, httpMethodsToRetry: ['GET', 'HEAD'], statusCodesToRetry: [[429, 429], [500, 599]], totalTimeout: 10000 } }), calendarId };
  }
  async saveCalendar(calendarId: string) {
    calendarId = calendarId.trim();
    if (!calendarId || /[\s/:<>]/.test(calendarId)) {
      throw new BadRequestException('Copia el valor del campo «ID del calendario» en «Integrar calendario».');
    }
    const row = await this.connection();
    if (!row) throw new BadRequestException('Conecta primero tu cuenta Google.');
    const auth = this.oauth();
    auth.setCredentials({ refresh_token: decryptCalendarToken(row.refresh_token, this.key()) });
    const api = calendar({ version: 'v3', auth });
    const { data } = await api.calendars.get({ calendarId }, { timeout: 8000 });
    if (!data.dataOwner && calendarId !== 'primary') {
      const { data: primary } = await api.calendars.get({ calendarId: 'primary' }, { timeout: 8000 });
      if (!data.id || data.id !== primary.id) throw new BadRequestException('Selecciona un calendario de la cuenta Google conectada.');
    }
    calendarId = data.id || calendarId;
    // Do not redirect pending operations or existing events to a different calendar.
    const [used] = await this.db.query('SELECT 1 FROM reunion WHERE google_calendar_id IS NOT NULL AND google_calendar_id<>$1 LIMIT 1', [calendarId]);
    if (used) throw new BadRequestException('Ya hay citas vinculadas a otro calendario. Conserva su calendario de destino.');
    await api.events.list({ calendarId, maxResults: 1 }, { timeout: 8000 });
    await this.db.query('UPDATE google_calendar_connection SET calendar_id=$1,updated_at=now() WHERE id=1', [calendarId]);
    return { ok: true, name: data.summary, supportsMeet: data.conferenceProperties?.allowedConferenceSolutionTypes?.includes('hangoutsMeet') || false };
  }
  async busy(start: string, end: string) {
    const { api, calendarId } = await this.client();
    const { data } = await api.freebusy.query({ requestBody: { timeMin: start, timeMax: end, timeZone: 'America/Lima', items: [{ id: calendarId }] } }, { timeout: 8000 });
    const entry = data.calendars?.[calendarId];
    if (!entry || entry.errors?.length) throw new ServiceUnavailableException('Google no pudo comprobar la disponibilidad del calendario.');
    return entry.busy || [];
  }
  async event(id: string, targetCalendar?: string) {
    const { api, calendarId } = await this.client();
    try { return (await api.events.get({ calendarId: targetCalendar || calendarId, eventId: id }, { timeout: 8000 })).data; }
    catch (e) { if ([404, 410].includes(googleCode(e))) return null; throw e; }
  }
}
