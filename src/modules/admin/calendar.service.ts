import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { GoogleCalendarService, googleCode, safeCalendarError } from './google-calendar.service.js';

export const calendarDay = (time = Date.now()) => new Date(time - 5 * 3600000).toISOString().slice(0, 10);
export const calendarBounds = () => ({ desde: calendarDay(), hasta: calendarDay(Date.now() + 29 * 86400000) });
export const eventIdFor = (id: string) => 'tesispro' + id.replaceAll('-', '').toLowerCase();
export const overlaps = (a: number, b: number, c: number, d: number) => a < d && c < b;
export const calendarResult = (r: any) => ({ idReunion: r.id_reunion, fechaInicio: r.fecha_inicio, fechaFin: r.fecha_fin,
  estado: r.estado, eventUrl: r.event_url, meetUrl: r.meet_url, meetStatus: r.meet_status, syncStatus: r.sync_status });

export function bookingSlots(fecha: string, now = Date.now()) {
  const range = calendarBounds();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha < range.desde || fecha > range.hasta ||
      new Date(`${fecha}T12:00:00-05:00`).toISOString().slice(0, 10) !== fecha)
    throw new BadRequestException('Elige una fecha válida dentro de los próximos 30 días.');
  const day = new Date(`${fecha}T12:00:00-05:00`).getUTCDay();
  if (day === 0 || day === 6) return [];
  const start = Date.parse(`${fecha}T09:00:00-05:00`);
  return Array.from({ length: 18 }, (_, i) => new Date(start + i * 1800000).toISOString()).filter(s => Date.parse(s) > now);
}

@Injectable()
export class CalendarService {
  constructor(private readonly db: DataSource, private readonly google: GoogleCalendarService) {}
  async ready() { await this.google.client(); }
  async limit(ip: string) {
    const key = createHash('sha256').update(ip).digest('hex');
    const [row] = await this.db.query(`INSERT INTO calendar_rate_limit(key,window_at,attempts) VALUES($1,now(),1)
      ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN calendar_rate_limit.window_at<now()-interval '10 minutes' THEN 1 ELSE calendar_rate_limit.attempts+1 END,
      window_at=CASE WHEN calendar_rate_limit.window_at<now()-interval '10 minutes' THEN now() ELSE calendar_rate_limit.window_at END RETURNING attempts`, [key]);
    if (row.attempts > 30) throw new ServiceUnavailableException('Demasiadas solicitudes de reserva. Espera unos minutos.');
  }
  async lock(m: EntityManager) { await m.query("SELECT pg_advisory_xact_lock(hashtextextended('calendar:slots',0))"); }
  async reserve(m: EntityManager, iso: string, ignore?: string) {
    if (!bookingSlots(calendarDay(Date.parse(iso))).includes(iso)) throw new BadRequestException('Horario no disponible.');
    await this.lock(m);
    const end = new Date(Date.parse(iso) + 1800000).toISOString();
    const [occupied] = await m.query(`SELECT 1 FROM (
      SELECT id_reunion,fecha_inicio AS a,fecha_fin AS b FROM reunion WHERE estado IN ('pendiente','confirmada')
      UNION ALL SELECT id_reunion,start_at,end_at FROM calendar_hold
      ) t WHERE ($3::uuid IS NULL OR id_reunion<>$3) AND a<$2 AND b>$1 LIMIT 1`, [iso, end, ignore || null]);
    if (occupied) throw new ConflictException('Ese horario acaba de reservarse. Elige otro.');
  }
  async availability(fecha: string) {
    const slots = bookingSlots(fecha);
    if (!slots.length) return { fecha, horarios: [], ...calendarBounds() };
    try {
      const busy = await this.google.busy(slots[0]!, new Date(Date.parse(slots.at(-1)!) + 1800000).toISOString());
      const local = await this.db.query(`SELECT fecha_inicio AS start,fecha_fin AS end FROM reunion WHERE estado IN ('pendiente','confirmada') AND fecha_inicio<$2 AND fecha_fin>$1
        UNION ALL SELECT start_at,end_at FROM calendar_hold WHERE start_at<$2 AND end_at>$1`, [slots[0], new Date(Date.parse(slots.at(-1)!) + 1800000).toISOString()]);
      return { fecha, horarios: slots.filter(s => ![...busy, ...local].some(b => overlaps(Date.parse(s), Date.parse(s) + 1800000, Date.parse(b.start), Date.parse(b.end)))), ...calendarBounds() };
    } catch (e) { throw new ServiceUnavailableException(safeCalendarError(e)); }
  }
  // Persist the intent before any remote write. A process crash or rolled-back finalization is recoverable.
  async prepare(id: string, action: 'create' | 'move' | 'cancel' | 'link', data: any = {}, user?: number) {
    const { calendarId } = await this.google.client();
    await this.db.transaction(async m => {
      await this.lock(m);
      const [r] = await m.query('SELECT * FROM reunion WHERE id_reunion=$1 FOR UPDATE', [id]);
      if (!r) throw new NotFoundException('Reunión no encontrada.');
      if (r.pending_action) {
        if (r.pending_action !== action || (action === 'move' && r.pending_data?.fechaInicio !== data.fechaInicio))
          throw new ConflictException('La reunión tiene una operación pendiente. Recupérala primero.');
        return;
      }
      if (r.estado === 'cancelada' && action !== 'cancel') throw new ConflictException('La reunión fue cancelada.');
      if (action === 'link' && r.external_event_id) return;
      if (action === 'move') {
        if (!r.external_event_id) throw new BadRequestException('Sincroniza primero esta reunión con Google.');
        await this.reserve(m, data.fechaInicio, id);
        await m.query('INSERT INTO calendar_hold(id_reunion,start_at,end_at) VALUES($1,$2,$2::timestamptz+interval \'30 minutes\')', [id, data.fechaInicio]);
      }
      if (action === 'link') {
        if (!bookingSlots(calendarDay(Date.parse(r.fecha_inicio))).includes(new Date(r.fecha_inicio).toISOString()))
          throw new BadRequestException('Solo puedes vincular citas futuras dentro del período de reservas.');
      }
      await m.query(`UPDATE reunion SET pending_action=$2,pending_data=$3::jsonb,sync_status='pendiente',sync_error=NULL,
        google_calendar_id=coalesce(google_calendar_id,$4),external_event_id=CASE WHEN $2 IN ('create','link') THEN coalesce(external_event_id,$5) ELSE external_event_id END WHERE id_reunion=$1`,
        [id, action, JSON.stringify({ ...data, operationKey: randomUUID() }), calendarId, eventIdFor(id)]);
      await m.query("INSERT INTO calendar_operation(id_reunion,action,id_usuario,status) VALUES($1,$2,$3,'pendiente')", [id, action, user || null]);
    });
  }
  async confirm(id: string) {
    const [r] = await this.db.query('SELECT * FROM reunion WHERE id_reunion=$1', [id]);
    if (!r) throw new NotFoundException('Reunión no encontrada.');
    if (r.estado === 'cancelada') throw new ConflictException('Esta reserva fue cancelada. Elige otro horario y comienza una nueva solicitud.');
    if (!r.pending_action && r.sync_status !== 'sincronizada') await this.prepare(id, 'create');
    return this.execute(id);
  }
  async updateLead(m: EntityManager, r: any) {
    await m.query("UPDATE lead SET reserva_pendiente=NOT EXISTS(SELECT 1 FROM reunion WHERE id_lead=$1 AND estado='confirmada' AND fecha_inicio>now()),revision=revision+1,updated_at=now() WHERE id_lead=$1", [r.id_lead]);
    if (r.id_solicitud) {
      const [saved] = await m.query('SELECT estado FROM reunion WHERE id_reunion=$1', [r.id_reunion]);
      const type = saved.estado === 'cancelada' ? 'reserva_cancelada' : saved.estado === 'confirmada' ? 'reserva_confirmada' : null;
      if (type && saved.estado !== r.estado) await m.query('INSERT INTO evento_recurso(id_solicitud,tipo) VALUES($1,$2)', [r.id_solicitud, type]);
    }
  }
  private async saveEvent(m: EntityManager, r: any, event: any) {
    if (event.status === 'cancelled') {
      await m.query("UPDATE reunion SET estado='cancelada',sync_status='sincronizada',sync_error=NULL,cancelada_at=coalesce(cancelada_at,now()),synced_at=now(),revision=revision+1 WHERE id_reunion=$1", [r.id_reunion]);
    } else {
      const start = event.start?.dateTime || (event.start?.date ? `${event.start.date}T00:00:00-05:00` : null);
      const end = event.end?.dateTime || (event.end?.date ? `${event.end.date}T00:00:00-05:00` : null);
      if (!start || !end || Date.parse(end) <= Date.parse(start)) throw new BadRequestException('Google devolvió fechas de evento inválidas.');
      const [conflict] = await m.query(`SELECT 1 FROM (
        SELECT id_reunion,fecha_inicio AS a,fecha_fin AS b FROM reunion WHERE estado IN ('pendiente','confirmada')
        UNION ALL SELECT id_reunion,start_at,end_at FROM calendar_hold) t
        WHERE id_reunion<>$1 AND a<$3 AND b>$2 LIMIT 1`, [r.id_reunion, start, end]);
      if (conflict) throw new ConflictException('El horario de Google entra en conflicto con otra reunión. Resuélvelo en Google y actualiza.');
      const manualMeet = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(event.location || '') ? event.location : null;
      const meet = manualMeet || event.hangoutLink || event.conferenceData?.entryPoints?.find((p: any) => p.entryPointType === 'video')?.uri || null;
      await m.query(`UPDATE reunion SET fecha_inicio=$2,fecha_fin=$3,estado='confirmada',event_url=$4,meet_url=$5,
        meet_status=$6,sync_status='sincronizada',sync_error=NULL,synced_at=now(),revision=revision+1 WHERE id_reunion=$1`,
        [r.id_reunion, start, end, event.htmlLink || null, meet, manualMeet ? 'manual' : event.conferenceData?.createRequest?.status?.statusCode || (meet ? 'success' : 'unavailable')]);
    }
    await this.updateLead(m, r);
  }
  async execute(id: string) {
    let attemptedKey: string | undefined;
    try {
      return await this.db.transaction(async m => {
        await this.lock(m);
        const [r] = await m.query('SELECT * FROM reunion WHERE id_reunion=$1 FOR UPDATE', [id]);
        if (!r) throw new NotFoundException('Reunión no encontrada.');
        const action = r.pending_action;
        if (!action) return calendarResult(r);
        attemptedKey = r.pending_data?.operationKey;
        const calendarId = r.google_calendar_id, eventId = r.external_event_id;
        const api = eventId ? (await this.google.client()).api : null;
        let event = eventId ? await this.google.event(eventId, calendarId) : null;
        if (action === 'cancel') {
          if (event && event.status !== 'cancelled') await api!.events.delete({ calendarId, eventId, sendUpdates: 'all' }, { timeout: 8000 });
          await m.query("UPDATE reunion SET estado='cancelada',motivo_cancelacion=$2,cancelada_at=coalesce(cancelada_at,now()),id_usuario_cancelacion=$3,sync_status='sincronizada',synced_at=now(),revision=revision+1 WHERE id_reunion=$1", [id, r.pending_data.motivo, r.pending_data.usuario || null]);
          await this.updateLead(m, r);
        } else if (action === 'move') {
          if (!event || event.status === 'cancelled') throw new ConflictException('El evento ya no existe en Google. Actualiza el calendario.');
          const target = r.pending_data.fechaInicio, end = new Date(Date.parse(target) + 1800000).toISOString();
          if (Date.parse(event.start?.dateTime || '') !== Date.parse(target)) {
            // List actual events to exclude this meeting's old interval during a move.
            const listed = await api!.events.list({ calendarId, timeMin: target, timeMax: end, singleEvents: true, maxResults: 2500 }, { timeout: 8000 });
            if (listed.data.nextPageToken || listed.data.items?.some(e => e.id !== eventId && e.status !== 'cancelled' && e.transparency !== 'transparent'))
              throw new ConflictException({ message: 'El nuevo horario está ocupado en Google. Elige otro horario.', code: 'CALENDAR_SLOT_BUSY' });
            event = (await api!.events.patch({ calendarId, eventId, sendUpdates: 'all', conferenceDataVersion: 1,
              requestBody: { start: { dateTime: target, timeZone: 'America/Lima' }, end: { dateTime: end, timeZone: 'America/Lima' } } }, { timeout: 8000 })).data;
          }
          await this.saveEvent(m, r, event);
        } else {
          if (!event) {
            const start = new Date(r.fecha_inicio).toISOString(), end = new Date(r.fecha_fin).toISOString();
            if (Date.parse(start) <= Date.now()) throw new ConflictException({ message: 'La hora de la reserva ya pasó. Elige otro horario.', code: 'CALENDAR_SLOT_BUSY' });
            const busy = await this.google.busy(start, end);
            if (busy.some(b => overlaps(Date.parse(start), Date.parse(end), Date.parse(b.start!), Date.parse(b.end!))))
              throw new ConflictException({ message: 'Ese horario está ocupado en Google. Elige otro horario.', code: 'CALENDAR_SLOT_BUSY' });
            const metadata = await api!.calendars.get({ calendarId }, { timeout: 8000 });
            const supportsMeet = metadata.data.conferenceProperties?.allowedConferenceSolutionTypes?.includes('hangoutsMeet');
            try {
              event = (await api!.events.insert({ calendarId, sendUpdates: 'all', conferenceDataVersion: 1, requestBody: {
                id: eventId, summary: `Asesoría Tesispro - ${r.nombres}`, description: 'Evaluación gratuita de tesis · Tesispro',
                start: { dateTime: start, timeZone: 'America/Lima' }, end: { dateTime: end, timeZone: 'America/Lima' },
                attendees: [{ email: r.correo }], extendedProperties: { private: { tesisproMeetingId: id } },
                ...(supportsMeet ? { conferenceData: { createRequest: { requestId: eventId, conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
              } }, { timeout: 8000 })).data;
            } catch (e) { if (googleCode(e) !== 409) throw e; event = await this.google.event(eventId, calendarId); }
          }
          if (!event) throw new ServiceUnavailableException('Google aún no permite verificar el evento. Reintenta.');
          if (event.extendedProperties?.private?.tesisproMeetingId !== id) throw new ConflictException('El identificador pertenece a otro evento de Google.');
          await this.saveEvent(m, r, event);
        }
        await m.query('DELETE FROM calendar_hold WHERE id_reunion=$1', [id]);
        await m.query('UPDATE reunion SET pending_action=NULL,pending_data=NULL,sync_error=NULL WHERE id_reunion=$1', [id]);
        await m.query("UPDATE calendar_operation SET status='completada',error=NULL WHERE id_reunion=$1 AND status='pendiente'", [id]);
        const [saved] = await m.query('SELECT * FROM reunion WHERE id_reunion=$1', [id]);
        return calendarResult(saved);
      });
    } catch (e) {
      const message = e instanceof ConflictException ? e.message : safeCalendarError(e);
      if (e instanceof ConflictException && (e.getResponse() as any)?.code === 'CALENDAR_SLOT_BUSY') {
        await this.db.transaction(async m => {
          await this.lock(m);
          const [r] = await m.query('SELECT * FROM reunion WHERE id_reunion=$1 FOR UPDATE', [id]);
          if (!r || r.pending_data?.operationKey !== attemptedKey) return;
          // This error is raised before the remote write, so the hold can be released safely.
          await m.query(`UPDATE reunion SET estado=CASE WHEN pending_action='create' THEN 'cancelada' ELSE estado END,
            external_event_id=CASE WHEN pending_action='link' THEN NULL ELSE external_event_id END,
            google_calendar_id=CASE WHEN pending_action='link' THEN NULL ELSE google_calendar_id END,
            pending_action=NULL,pending_data=NULL,sync_status=CASE WHEN pending_action='move' THEN 'sincronizada' WHEN pending_action='link' THEN 'sin_vincular' ELSE 'error' END,sync_error=$2 WHERE id_reunion=$1`, [id, message]);
          await m.query('DELETE FROM calendar_hold WHERE id_reunion=$1', [id]);
          await m.query("UPDATE calendar_operation SET status='rechazada',error=$2 WHERE id_reunion=$1 AND status='pendiente'", [id, message]);
          await this.updateLead(m, r);
        });
        throw e;
      }
      await this.db.query("UPDATE reunion SET sync_status='error',sync_error=$2 WHERE id_reunion=$1 AND pending_action IS NOT NULL AND pending_data->>'operationKey'=$3", [id, message, attemptedKey || null]);
      await this.db.query("UPDATE calendar_operation SET error=$2 WHERE id_reunion=$1 AND status='pendiente' AND EXISTS(SELECT 1 FROM reunion WHERE id_reunion=$1 AND pending_data->>'operationKey'=$3)", [id, message, attemptedKey || null]);
      if (e instanceof ConflictException || e instanceof BadRequestException) throw e;
      throw new ServiceUnavailableException(message);
    }
  }
  async cancel(id: string, motivo: string, usuario: number) {
    // A pending create with an uncertain outcome must still be checked and deleted remotely.
    await this.db.transaction(async m => {
      await this.lock(m);
      const [r] = await m.query('SELECT * FROM reunion WHERE id_reunion=$1 FOR UPDATE', [id]);
      if (!r) throw new NotFoundException('Reunión no encontrada.');
      if (r.estado === 'cancelada' && !r.pending_action) return;
      await m.query("UPDATE calendar_operation SET status='sustituida' WHERE id_reunion=$1 AND status='pendiente'", [id]);
      await m.query("UPDATE reunion SET pending_action='cancel',pending_data=$2::jsonb,sync_status='pendiente',sync_error=NULL WHERE id_reunion=$1", [id, JSON.stringify({ motivo, usuario, operationKey: randomUUID() })]);
      await m.query("INSERT INTO calendar_operation(id_reunion,action,id_usuario,status) VALUES($1,'cancel',$2,'pendiente')", [id, usuario]);
    });
    return this.execute(id);
  }
  async move(id: string, fechaInicio: string, user: number) {
    const iso = new Date(fechaInicio).toISOString();
    await this.prepare(id, 'move', { fechaInicio: iso }, user);
    return this.execute(id);
  }
  async refresh() {
    await this.google.client();
    const rows = await this.db.query(`SELECT * FROM reunion WHERE (estado='pendiente' AND external_event_id IS NULL) OR pending_action IS NOT NULL OR
      (external_event_id IS NOT NULL AND (estado<>'cancelada' OR synced_at>now()-interval '30 days')) ORDER BY coalesce(synced_at,created_at),id_reunion LIMIT 10`);
    const errors: { idReunion: string; message: string }[] = [];
    for (const r of rows) {
      try {
        if (r.pending_action) { await this.execute(r.id_reunion); continue; }
        if (r.estado === 'pendiente' && !r.external_event_id) { await this.confirm(r.id_reunion); continue; }
        const event = await this.google.event(r.external_event_id, r.google_calendar_id);
        await this.db.transaction(async m => {
          await this.lock(m);
          const [current] = await m.query('SELECT * FROM reunion WHERE id_reunion=$1 FOR UPDATE', [r.id_reunion]);
          if (current.pending_action || current.revision !== r.revision) return;
          await this.saveEvent(m, current, event || { status: 'cancelled' });
        });
      } catch (e) {
        const message = e instanceof ConflictException ? e.message : safeCalendarError(e);
        errors.push({ idReunion: r.id_reunion, message });
        await this.db.query("UPDATE reunion SET sync_status='error',sync_error=$2,synced_at=now() WHERE id_reunion=$1", [r.id_reunion, message]);
      }
    }
    await this.db.query("DELETE FROM calendar_rate_limit WHERE window_at<now()-interval '1 day'");
    return { checked: rows.length, errors, more: rows.length === 10 };
  }
  async range(from: string, to: string) {
    if (Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 62 * 86400000) throw new BadRequestException('Consulta un intervalo de hasta 62 días.');
    const items = await this.db.query(`SELECT * FROM reunion WHERE fecha_inicio<$2 AND fecha_fin>$1 ORDER BY fecha_inicio,id_reunion`, [from, to]);
    return { items: items.map((r: any) => ({ ...calendarResult(r), nombres: r.nombres, correo: r.correo, telefono: r.telefono, idLead: r.id_lead,
      descripcion: r.descripcion, universidad: r.universidad, syncError: r.sync_error, pendingAction: r.pending_action, revision: r.revision })) };
  }
}
