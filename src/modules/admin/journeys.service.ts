import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import {
  AttributionDto,
  BookMeetingDto,
  CampaignLinkDto,
  JourneyListDto,
  MeetingListDto,
  ResourceContactDto,
} from './journeys.dto.js';
import { journeyConditions } from './journey-filters.js';

type Row = Record<string, any>;
const camel = (r: Row) =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      v,
    ]),
  );
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export function normalizeContactPhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 9) digits = '51' + digits;
  if (!/^[1-9]\d{7,14}$/.test(digits))
    throw new BadRequestException(
      'Ingresa un teléfono válido con código de país.',
    );
  return '+' + digits;
}
const phoneSql = (column: string) =>
  `CASE WHEN length(regexp_replace(${column},'[^0-9]','','g'))=9 THEN '51'||regexp_replace(${column},'[^0-9]','','g') ELSE regexp_replace(${column},'[^0-9]','','g') END`;
const limaDay = (time = Date.now()) =>
  new Date(time - 5 * 3600000).toISOString().slice(0, 10);
const bounds = () => ({
  desde: limaDay(),
  hasta: limaDay(Date.now() + 29 * 86400000),
});
const published = `activo=true AND publicado=true`;

@Injectable()
export class JourneysService {
  constructor(private readonly db: DataSource) {}
  async publicResources() {
    return this.db.query(
      `SELECT id_recurso AS "idRecurso",titulo,descripcion,categoria,formato FROM recurso_gratuito WHERE ${published} AND destacado=true ORDER BY fecha_actualizacion DESC,id_recurso DESC`,
    );
  }
  async publicResource(id: number, m: EntityManager = this.db.manager) {
    const [row] = await m.query(
      `SELECT id_recurso AS "idRecurso",titulo,descripcion,categoria,formato FROM recurso_gratuito WHERE id_recurso=$1 AND ${published}`,
      [id],
    );
    if (!row)
      throw new NotFoundException(
        'Este recurso no está publicado o ya no está disponible.',
      );
    return row;
  }
  async links(id: number) {
    return this.db
      .query(
        'SELECT * FROM enlace_recurso WHERE id_recurso=$1 ORDER BY created_at DESC',
        [id],
      )
      .then((rows) => rows.map(camel));
  }
  async createLink(id: number, dto: CampaignLinkDto) {
    await this.publicResource(id);
    const codigo = randomBytes(12).toString('hex');
    const [row] = await this.db.query(
      'INSERT INTO enlace_recurso(codigo,id_recurso,canal,medio,campana,publicacion) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
      [codigo, id, dto.canal, dto.medio, dto.campana, dto.publicacion || null],
    );
    return { ...camel(row), path: `/r/${codigo}` };
  }
  async link(code: string, m: EntityManager = this.db.manager) {
    if (!/^[a-f0-9]{24}$/.test(code))
      throw new NotFoundException('Enlace no disponible.');
    const [link] = await m.query(
      'SELECT * FROM enlace_recurso WHERE codigo=$1 AND activo=true',
      [code],
    );
    if (!link) throw new NotFoundException('Enlace no disponible.');
    await this.publicResource(link.id_recurso, m);
    return link;
  }
  async redirect(code: string) {
    const link = await this.link(code);
    await this.db.query(
      'UPDATE enlace_recurso SET clics=clics+1 WHERE codigo=$1',
      [code],
    );
    const url = new URL(process.env.APP_ORIGIN || 'http://localhost:4321');
    url.pathname = '/';
    url.search = '';
    url.hash = 'recursos';
    for (const [key, value] of Object.entries({
      recurso: link.id_recurso,
      enlace: code,
      utm_source: link.canal,
      utm_medium: link.medio,
      utm_campaign: link.campana,
      utm_content: link.publicacion,
    }))
      if (value !== null) url.searchParams.set(key, String(value));
    return url.toString();
  }
  async visit(id: number, dto: AttributionDto) {
    const token = randomBytes(32).toString('hex');
    await this.db.transaction(async (m) => {
      const resource = await this.publicResource(id, m);
      const link = dto.enlace ? await this.link(dto.enlace, m) : null;
      if (link && link.id_recurso !== id)
        throw new BadRequestException('El enlace no corresponde al recurso.');
      const canal = link?.canal || dto.canal || 'directo',
        medio = link?.medio || dto.medio || null,
        campana = link?.campana || dto.campana || null,
        publicacion = link?.publicacion || dto.publicacion || null;
      const source = [
        'facebook',
        'instagram',
        'tiktok',
        'linkedin',
        'youtube',
      ].includes(canal)
        ? 'red_social'
        : [
              'directo',
              'busqueda',
              'referido',
              'correo',
              'whatsapp',
              'convenio_institucional',
            ].includes(canal)
          ? canal
          : 'otro';
      const [session] = await m.query(
        'INSERT INTO sesion_landing(canal_origen,id_recurso,utm_source,utm_medium,visito_formulario) VALUES($1,$2,$3,$4,true) RETURNING id_sesion',
        [source, id, canal, medio],
      );
      const requestId = randomUUID();
      await m.query(
        `INSERT INTO solicitud_recurso(id_solicitud,token_hash,id_recurso,titulo,formato,codigo_enlace,id_sesion,canal,medio,campana,publicacion) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          requestId,
          digest(token),
          id,
          resource.titulo,
          resource.formato,
          link?.codigo || null,
          session.id_sesion,
          canal,
          medio,
          campana,
          publicacion,
        ],
      );
      await this.event(m, requestId, 'llegada');
    });
    return { token };
  }
  private async access(m: EntityManager, token: string, captured = false) {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Vuelve a acceder al recurso.');
    const [s] = await m.query(
      `SELECT s.* FROM solicitud_recurso s WHERE token_hash=$1 AND expires_at>now() FOR UPDATE`,
      [digest(token)],
    );
    if (!s)
      throw new UnauthorizedException(
        'El acceso expiró. Vuelve a completar el formulario.',
      );
    if (s.formulario_completado && !s.id_buyer && !s.id_lead)
      throw new UnauthorizedException(
        'Vuelve a completar el acceso al recurso.',
      );
    await this.publicResource(s.id_recurso, m);
    if (captured && (!s.formulario_completado || (!s.id_buyer && !s.id_lead)))
      throw new BadRequestException('Completa primero tus datos de contacto.');
    return s;
  }
  private event(m: EntityManager, id: string, tipo: string, once = false) {
    return m.query(
      `INSERT INTO evento_recurso(id_solicitud,tipo) SELECT $1::uuid,$2::varchar ${once ? 'WHERE NOT EXISTS(SELECT 1 FROM evento_recurso WHERE id_solicitud=$1::uuid AND tipo=$2::varchar)' : ''}`,
      [id, tipo],
    );
  }
  async state(token: string) {
    return this.db.transaction(async (m) => {
      const s = await this.access(m, token);
      const [meeting] = await m.query(
        "SELECT id_reunion,fecha_inicio,estado FROM reunion WHERE id_solicitud=$1 ORDER BY (estado='confirmada') DESC,created_at DESC LIMIT 1",
        [s.id_solicitud],
      );
      return {
        capturado: !!s.formulario_completado,
        esLead: !!s.id_lead,
        reunion: meeting ? camel(meeting) : null,
        ...bounds(),
      };
    });
  }
  async contact(token: string, dto: ResourceContactDto) {
    return this.db.transaction(async (m) => {
      const s = await this.access(m, token);
      if (s.formulario_completado) return { ok: true };
      const telefono = normalizeContactPhone(dto.telefono),
        digits = telefono.slice(1);
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        telefono,
      ]);
      const leads = await m.query(
        `SELECT id_lead FROM lead WHERE ${phoneSql('telefono')}=$1 ORDER BY id_lead LIMIT 2`,
        [digits],
      );
      if (leads.length > 1)
        throw new ConflictException(
          'Hay varios perfiles con este teléfono. Comunícate con un asesor.',
        );
      let leadId = leads[0]?.id_lead || null,
        buyerId = null;
      const buyers = await m.query(
        `SELECT * FROM buyer WHERE ${phoneSql('telefono')}=$1 ORDER BY id_buyer LIMIT 2 FOR UPDATE`,
        [digits],
      );
      if (buyers.length > 1)
        throw new ConflictException(
          'Hay varios perfiles con este teléfono. Comunícate con un asesor.',
        );
      if (buyers[0]) {
        buyerId = buyers[0].id_buyer;
        leadId = leadId || buyers[0].id_lead;
      } else if (!leadId) {
        const [b] = await m.query(
          `INSERT INTO buyer(nombres,telefono,canal_origen,motivo_captacion,recurso_interes,consentimiento_at) VALUES($1,$2,$3,'descarga_recurso',$4,now()) RETURNING id_buyer`,
          [dto.nombres, telefono, s.canal, s.titulo],
        );
        buyerId = b.id_buyer;
      }
      await m.query(
        'UPDATE solicitud_recurso SET nombres=$1,telefono=$2,id_buyer=$3,id_lead=$4,formulario_completado=now() WHERE id_solicitud=$5',
        [dto.nombres, telefono, buyerId, leadId, s.id_solicitud],
      );
      await m.query(
        'UPDATE sesion_landing SET completo_formulario=true,tuvo_interaccion=true WHERE id_sesion=$1',
        [s.id_sesion],
      );
      await this.event(m, s.id_solicitud, 'formulario_completado', true);
      return { ok: true };
    });
  }
  async options(token: string) {
    return this.db.transaction(async (m) => {
      const s = await this.access(m, token, true);
      await this.event(m, s.id_solicitud, 'opciones_mostradas', true);
      return { ok: true };
    });
  }
  async download(token: string) {
    return this.db.transaction(async (m) => {
      const s = await this.access(m, token, true);
      await this.event(m, s.id_solicitud, 'descarga_solicitada');
      const [file] = await m.query(
        'SELECT archivo_contenido,archivo_mime,archivo_nombre,archivo_url FROM recurso_gratuito WHERE id_recurso=$1',
        [s.id_recurso],
      );
      if (!file.archivo_contenido) {
        if (!/^https?:\/\//i.test(file.archivo_url))
          throw new BadRequestException(
            'El enlace del recurso no está disponible.',
          );
      }
      return { ...file, idSolicitud: s.id_solicitud };
    });
  }
  async delivered(id: string) {
    await this.event(this.db.manager, id, 'archivo_entregado');
  }
  async external(token: string) {
    return this.db.transaction(async (m) => {
      const s = await this.access(m, token, true);
      const [file] = await m.query(
        'SELECT archivo_url,archivo_contenido IS NOT NULL AS subido FROM recurso_gratuito WHERE id_recurso=$1',
        [s.id_recurso],
      );
      if (file.subido || !/^https?:\/\//i.test(file.archivo_url))
        throw new BadRequestException(
          'Este recurso no tiene un enlace externo válido.',
        );
      await this.event(m, s.id_solicitud, 'enlace_externo_abierto');
      return { url: file.archivo_url };
    });
  }
  async startMeeting(token: string) {
    return this.db.transaction(async (m) => {
      const s = await this.access(m, token, true);
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        s.telefono,
      ]);
      let leadId = s.id_lead;
      let buyer: Row | undefined;
      if (s.id_buyer) {
        [buyer] = await m.query(
          'SELECT * FROM buyer WHERE id_buyer=$1 FOR UPDATE',
          [s.id_buyer],
        );
        leadId = leadId || buyer?.id_lead;
      }
      if (!leadId) {
        const [existing] = await m.query(
          `SELECT id_lead FROM lead WHERE ${phoneSql('telefono')}=$1 ORDER BY id_lead LIMIT 1`,
          [s.telefono.slice(1)],
        );
        leadId = existing?.id_lead;
      }
      if (!leadId) {
        await m.query(
          "SELECT set_config('app.admin_motivo','Interés en reunión desde un recurso; reserva pendiente',true)",
        );
        const [lead] = await m.query(
          `INSERT INTO lead(nombres,apellidos,telefono,correo,id_estado,id_sesion_origen,fecha_nacimiento,departamento,reserva_pendiente)
        VALUES($1,$2,$3,$4,(SELECT id_estado FROM estado_lead WHERE codigo='nuevo'),$5,$6,$7,true) RETURNING id_lead`,
          [
            buyer?.nombres || s.nombres,
            buyer?.apellidos || null,
            s.telefono,
            buyer?.correo || null,
            s.id_sesion,
            buyer?.fecha_nacimiento || null,
            buyer?.departamento || null,
          ],
        );
        leadId = lead.id_lead;
        if (buyer) {
          await m.query(
            'INSERT INTO perfil_academico(id_lead,id_universidad,universidad_otra,id_grado,condicion) VALUES($1,$2,$3,$4,$5)',
            [
              leadId,
              buyer.id_universidad,
              buyer.universidad_otra,
              buyer.id_grado,
              buyer.condicion,
            ],
          );
          if (buyer.id_etapa)
            await m.query(
              'INSERT INTO proyecto_tesis(id_lead,id_etapa,observaciones) VALUES($1,$2,$3)',
              [leadId, buyer.id_etapa, buyer.notas],
            );
        }
      }
      if (buyer && buyer.estado === 'buyer')
        await m.query(
          "UPDATE buyer SET estado='lead',id_lead=$1,fecha_conversion=now(),updated_at=now() WHERE id_buyer=$2",
          [leadId, buyer.id_buyer],
        );
      // Todas las solicitudes anteriores del buyer siguen visibles en su ficha de lead.
      if (s.id_buyer)
        await m.query(
          'UPDATE solicitud_recurso SET id_lead=$1 WHERE id_buyer=$2',
          [leadId, s.id_buyer],
        );
      await m.query(
        'UPDATE solicitud_recurso SET id_lead=$1 WHERE id_solicitud=$2',
        [leadId, s.id_solicitud],
      );
      await m.query(
        "UPDATE lead SET reserva_pendiente=NOT EXISTS(SELECT 1 FROM reunion WHERE id_lead=$1 AND estado='confirmada' AND fecha_inicio>now()) WHERE id_lead=$1",
        [leadId],
      );
      await this.event(m, s.id_solicitud, 'clic_agendar', true);
      return { ok: true, ...bounds() };
    });
  }
  private slots(fecha: string) {
    const range = bounds();
    if (fecha < range.desde || fecha > range.hasta)
      throw new BadRequestException(
        'Elige una fecha dentro de los próximos 30 días.',
      );
    const day = new Date(`${fecha}T12:00:00-05:00`).getUTCDay();
    if (day === 0 || day === 6) return [];
    const start = new Date(`${fecha}T09:00:00-05:00`).getTime();
    return Array.from({ length: 18 }, (_, i) =>
      new Date(start + i * 1800000).toISOString(),
    ).filter((iso) => Date.parse(iso) > Date.now());
  }
  async availability(token: string, fecha: string) {
    return this.db.transaction(async (m) => {
      const s = await this.access(m, token, true);
      if (!s.id_lead)
        throw new BadRequestException('Pulsa primero Agendar reunión.');
      const slots = this.slots(fecha);
      const booked = await m.query(
        "SELECT fecha_inicio FROM reunion WHERE estado='confirmada' AND fecha_inicio=ANY($1::timestamptz[])",
        [slots],
      );
      const occupied = new Set(
        booked.map((r: Row) => new Date(r.fecha_inicio).toISOString()),
      );
      return {
        fecha,
        horarios: slots.filter((iso) => !occupied.has(iso)),
        ...bounds(),
      };
    });
  }
  async book(token: string, dto: BookMeetingDto) {
    const iso = new Date(dto.fechaInicio).toISOString();
    try {
      return await this.db.transaction(async (m) => {
        const s = await this.access(m, token, true);
        if (!s.id_lead)
          throw new BadRequestException('Pulsa primero Agendar reunión.');
        const [prior] = await m.query(
          "SELECT * FROM reunion WHERE id_solicitud=$1 AND estado='confirmada'",
          [s.id_solicitud],
        );
        if (prior) {
          if (new Date(prior.fecha_inicio).toISOString() === iso)
            return camel(prior);
          throw new ConflictException(
            'Ya tienes una reunión confirmada para esta solicitud.',
          );
        }
        if (!this.slots(limaDay(Date.parse(iso))).includes(iso))
          throw new BadRequestException(
            'El horario seleccionado no es válido o ya pasó.',
          );
        const telefono = normalizeContactPhone(dto.telefono);
        if (telefono !== s.telefono)
          throw new BadRequestException(
            'Utiliza el teléfono con el que solicitaste el recurso.',
          );
        await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          'slot:' + iso,
        ]);
        await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          dto.correo,
        ]);
        const [lead] = await m.query(
          'SELECT * FROM lead WHERE id_lead=$1 FOR UPDATE',
          [s.id_lead],
        );
        const [other] = await m.query(
          'SELECT id_lead FROM lead WHERE lower(correo)=$1 AND id_lead<>$2',
          [dto.correo, s.id_lead],
        );
        const [otherBuyer] = await m.query(
          "SELECT id_buyer FROM buyer WHERE correo=$1 AND estado='buyer' AND id_buyer IS DISTINCT FROM $2::bigint",
          [dto.correo, s.id_buyer],
        );
        if (
          other ||
          otherBuyer ||
          (lead.correo && lead.correo.toLowerCase() !== dto.correo)
        )
          throw new ConflictException(
            'El correo está asociado a otro perfil. Comunícate con un asesor para confirmar tus datos.',
          );
        const [meeting] = await m.query(
          `INSERT INTO reunion(id_reunion,id_solicitud,id_lead,fecha_inicio,fecha_fin,nombres,telefono,correo,universidad,descripcion) VALUES($1,$2,$3,$4,$4::timestamptz+interval '30 minutes',$5,$6,$7,$8,$9) RETURNING *`,
          [
            randomUUID(),
            s.id_solicitud,
            s.id_lead,
            iso,
            dto.nombres,
            telefono,
            dto.correo,
            dto.universidad,
            dto.descripcion,
          ],
        );
        await m.query(
          'UPDATE lead SET nombres=CASE WHEN correo IS NULL THEN $3 ELSE nombres END,correo=$1,reserva_pendiente=false,updated_at=now() WHERE id_lead=$2',
          [dto.correo, s.id_lead, dto.nombres],
        );
        await m.query(
          `INSERT INTO perfil_academico(id_lead,universidad_otra) VALUES($1,$2) ON CONFLICT(id_lead) DO UPDATE SET universidad_otra=CASE WHEN perfil_academico.id_universidad IS NULL THEN coalesce(perfil_academico.universidad_otra,excluded.universidad_otra) ELSE perfil_academico.universidad_otra END`,
          [s.id_lead, dto.universidad],
        );
        await this.event(m, s.id_solicitud, 'reserva_confirmada');
        return camel(meeting);
      });
    } catch (error) {
      const driver = (
        error as { driverError?: { code?: string; constraint?: string } }
      ).driverError;
      if (driver?.code === '23505')
        throw new ConflictException(
          driver.constraint === 'reunion_cupo_unico'
            ? 'Ese horario acaba de reservarse. Elige otro horario.'
            : 'Ya existe una reserva o un perfil con estos datos.',
        );
      throw error;
    }
  }
  async catalogos() {
    return {
      recursos: await this.db.query(
        'SELECT id_recurso AS "idRecurso",titulo FROM recurso_gratuito ORDER BY titulo',
      ),
    };
  }
  async history(dto: JourneyListDto) {
    const values: unknown[] = [],
      clauses = journeyConditions(dto, values);
    const add = (sql: string, v: unknown) => {
      values.push(v);
      clauses.push(sql.replace('?', `$${values.length}`));
    };
    if (dto.buyer) add('s.id_buyer=?', dto.buyer);
    if (dto.lead) add('s.id_lead=?', dto.lead);
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const [{ total }] = await m.query(
        `SELECT count(*)::int AS total FROM solicitud_recurso s ${where}`,
        values,
      );
      const rows = await m.query(
        `SELECT s.id_solicitud,s.id_recurso,s.titulo,s.formato,s.id_buyer,s.id_lead,s.nombres,s.telefono,s.canal,s.medio,s.campana,s.publicacion,s.created_at,s.formulario_completado,
        (SELECT json_agg(json_build_object('tipo',ev.tipo,'fecha',ev.fecha) ORDER BY ev.fecha,ev.id_evento) FROM evento_recurso ev WHERE ev.id_solicitud=s.id_solicitud) AS eventos,
        (SELECT re.estado FROM reunion re WHERE re.id_solicitud=s.id_solicitud ORDER BY (re.estado='confirmada') DESC,re.created_at DESC LIMIT 1) AS reunion_estado
        FROM solicitud_recurso s ${where} ORDER BY s.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, dto.pageSize, (dto.page - 1) * dto.pageSize],
      );
      return {
        items: rows.map(camel),
        total,
        page: dto.page,
        pageSize: dto.pageSize,
      };
    });
  }
  async meetings(dto: MeetingListDto) {
    if (dto.desde && dto.hasta && dto.desde > dto.hasta)
      throw new BadRequestException('Rango de fechas inválido.');
    const values: unknown[] = [],
      clauses = journeyConditions(dto, values);
    const add = (sql: string, v: unknown) => {
      values.push(v);
      clauses.push(sql.replaceAll('?', `$${values.length}`));
    };
    if (dto.estado) add('r.estado=?', dto.estado);
    if (dto.q)
      add(
        '(r.nombres ILIKE ? OR r.correo ILIKE ? OR r.telefono ILIKE ?)',
        `%${dto.q.replace(/[\\%_]/g, '\\$&')}%`,
      );
    if (dto.desde)
      add(
        "r.fecha_inicio >= (?::date::timestamp AT TIME ZONE 'America/Lima')",
        dto.desde,
      );
    if (dto.hasta)
      add(
        "r.fecha_inicio < ((?::date+1)::timestamp AT TIME ZONE 'America/Lima')",
        dto.hasta,
      );
    const from = `FROM reunion r JOIN solicitud_recurso s USING(id_solicitud) ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}`;
    const [{ total }] = await this.db.query(
      `SELECT count(*)::int AS total ${from}`,
      values,
    );
    const rows = await this.db.query(
      `SELECT r.*,s.titulo AS recurso,s.canal,s.campana ${from} ORDER BY r.fecha_inicio DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, dto.pageSize, (dto.page - 1) * dto.pageSize],
    );
    return {
      items: rows.map(camel),
      total,
      page: dto.page,
      pageSize: dto.pageSize,
    };
  }
  async cancel(id: string, motivo: string) {
    return this.db.transaction(async (m) => {
      const [r] = await m.query(
        'SELECT * FROM reunion WHERE id_reunion=$1 FOR UPDATE',
        [id],
      );
      if (!r) throw new NotFoundException('Reunión no encontrada.');
      if (r.estado === 'confirmada') {
        await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          'slot:' + new Date(r.fecha_inicio).toISOString(),
        ]);
        await m.query(
          "UPDATE reunion SET estado='cancelada',motivo_cancelacion=$1,cancelada_at=now() WHERE id_reunion=$2",
          [motivo, id],
        );
        await this.event(m, r.id_solicitud, 'reserva_cancelada');
        await m.query(
          "UPDATE lead SET reserva_pendiente=NOT EXISTS(SELECT 1 FROM reunion WHERE id_lead=$1 AND estado='confirmada' AND fecha_inicio>now()) WHERE id_lead=$1",
          [r.id_lead],
        );
      }
      return { ok: true };
    });
  }
}
