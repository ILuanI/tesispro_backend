import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import {
  ContactIdentityService,
  normalizeContactPhone,
} from './contact-identity.service.js';
import {
  CaptureProfileDto,
  GeneralMeetingDto,
  TesiBeginDto,
  TesiFinishDto,
} from './lead-profile.dto.js';
import { JourneysService } from './journeys.service.js';
import { TesiQualificationService } from './tesi-qualification.service.js';
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const contactCookie = 'tesispro_contact';
export const cookieToken = (header = '') =>
  header
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(contactCookie + '='))
    ?.slice(contactCookie.length + 1) || '';
@Injectable()
export class CaptureProfileService {
  constructor(
    private readonly db: DataSource,
    private readonly identity: ContactIdentityService,
    private readonly journeys: JourneysService,
    private readonly qualification: TesiQualificationService,
  ) {}
  async session(
    m: EntityManager,
    token: string,
    attribution: Record<string, any> = {},
  ) {
    if (/^[a-f0-9]{64}$/.test(token)) {
      const [existing] = await m.query(
        'SELECT * FROM acceso_contacto WHERE token_hash=$1 AND expires_at>now() FOR UPDATE',
        [digest(token)],
      );
      if (existing) return { ...existing, token };
    }
    token = randomBytes(32).toString('hex');
    const channel = attribution.canal || 'directo';
    const source = [
      'facebook',
      'instagram',
      'tiktok',
      'linkedin',
      'youtube',
    ].includes(channel)
      ? 'red_social'
      : [
            'busqueda',
            'referido',
            'correo',
            'whatsapp',
            'convenio_institucional',
            'directo',
          ].includes(channel)
        ? channel
        : 'otro';
    const [s] = await m.query(
      'INSERT INTO sesion_landing(canal_origen,utm_source,utm_medium,campana_origen) VALUES($1,$2,$3,$4) RETURNING id_sesion',
      [source, channel, attribution.medio || null, attribution.campana || null],
    );
    const [access] = await m.query(
      'INSERT INTO acceso_contacto(token_hash,id_sesion) VALUES($1,$2) RETURNING *',
      [digest(token), s.id_sesion],
    );
    return { ...access, token };
  }
  async open(token: string) {
    return this.db.transaction((m) => this.session(m, token));
  }
  async bind(
    m: EntityManager,
    session: any,
    buyer: string | null,
    lead: string | null,
  ) {
    if (
      (session.id_lead && session.id_lead !== lead) ||
      (!session.id_lead && session.id_buyer && session.id_buyer !== buyer)
    )
      throw new ConflictException(
        'La sesión ya contiene otro contacto. Inicia una nueva sesión para continuar.',
      );
    await m.query(
      'UPDATE acceso_contacto SET id_buyer=$2,id_lead=$3 WHERE token_hash=$1',
      [session.token_hash, buyer, lead],
    );
    await m.query('UPDATE conversacion SET id_lead=$2 WHERE id_sesion=$1', [
      session.id_sesion,
      lead,
    ]);
    await m.query('UPDATE calificacion_tesi SET id_buyer=$2,id_lead=$3 WHERE id_conversacion IN (SELECT id_conversacion FROM conversacion WHERE id_sesion=$1)', [session.id_sesion, buyer, lead]);
    await m.query('UPDATE derivacion_humana SET id_lead=$2 WHERE id_conversacion IN (SELECT id_conversacion FROM conversacion WHERE id_sesion=$1)', [session.id_sesion, lead]);
    await m.query(
      'UPDATE sugerencia_perfil SET id_buyer=$2,id_lead=$3 WHERE id_conversacion IN (SELECT id_conversacion FROM conversacion WHERE id_sesion=$1)',
      [session.id_sesion, buyer, lead],
    );
    await m.query(
      'UPDATE evento_perfil SET id_buyer=$2,id_lead=$3 WHERE id_sesion=$1 AND id_lead IS NULL',
      [session.id_sesion, buyer, lead],
    );
  }
  async linkResource(token: string, resourceToken: string) {
    await this.db.transaction(async (m) => {
      const s = await this.session(m, token);
      const [r] = await m.query(
        'SELECT id_buyer,id_lead FROM solicitud_recurso WHERE token_hash=$1 AND formulario_completado IS NOT NULL',
        [digest(resourceToken)],
      );
      if (r) await this.bind(m, s, r.id_buyer, r.id_lead);
    });
  }
  async captureIn(m: EntityManager, token: string, dto: CaptureProfileDto) {
    if (!dto.consentimiento)
      throw new BadRequestException(
        'Confirma el consentimiento para registrar tu consulta.',
      );
    const session = await this.session(m, token, dto);
    const [prior] = await m.query(
      'SELECT *,despues=$2::jsonb AS mismos_datos FROM evento_perfil WHERE clave=$1',
      [dto.clave, JSON.stringify(dto)],
    );
    if (prior) {
      if (String(prior.id_sesion) !== String(session.id_sesion))
        throw new ConflictException('Solicitud no disponible.');
      if (!prior.mismos_datos) throw new ConflictException('La solicitud ya fue registrada con otros datos.');
      return { session, buyer: prior.id_buyer, lead: prior.id_lead };
    }
    const owner = await this.identity.resolve(m, dto.correo, dto.telefono);
    let buyer = owner?.id_buyer || null,
      lead = owner?.id_lead || null;
    if (!owner) {
      const meta = Object.fromEntries(
        ['nombres', 'correo', 'telefono']
          .filter((k) => (dto as any)[k])
          .map((k) => [
            k,
            {
              origen: dto.fuente,
              confirmado: true,
              fecha: new Date().toISOString(),
            },
          ]),
      );
      const [b] = await m.query(
        "INSERT INTO buyer(nombres,correo,telefono,canal_origen,motivo_captacion,consentimiento_at,procedencia_campos) VALUES($1,$2,$3,$4,'consulta_general',now(),$5::jsonb) RETURNING id_buyer",
        [
          dto.nombres?.trim() || null,
          dto.correo?.trim().toLowerCase() || null,
          dto.telefono ? normalizeContactPhone(dto.telefono) : null,
          dto.canal || 'directo',
          JSON.stringify(meta),
        ],
      );
      buyer = b.id_buyer;
    } else {
      const table = lead ? 'lead' : 'buyer',
        column = lead ? 'id_lead' : 'id_buyer',
        ownerId = lead || buyer;
      const [current] = await m.query(
        `SELECT * FROM ${table} WHERE ${column}=$1 FOR UPDATE`,
        [ownerId],
      );
      const available: Record<string, string | null> = {
        nombres: dto.nombres?.trim() || null,
        correo: dto.correo?.trim().toLowerCase() || null,
        telefono: dto.telefono ? normalizeContactPhone(dto.telefono) : null,
      };
      const entries = Object.entries(available).filter(
        ([key, value]) => value && !current[key],
      );
      if (entries.length) {
        const provenance = Object.fromEntries(
          entries.map(([key]) => [
            key,
            {
              origen: dto.fuente,
              confirmado: true,
              fecha: new Date().toISOString(),
            },
          ]),
        );
        await m.query(
          `UPDATE ${table} SET ${entries.map(([key], i) => `${key}=$${i + 2}`).join(',')},revision=revision+1,updated_at=now(),procedencia_campos=procedencia_campos || $${entries.length + 2}::jsonb WHERE ${column}=$1`,
          [
            ownerId,
            ...entries.map(([, value]) => value),
            JSON.stringify(provenance),
          ],
        );
      }
    }
    await this.bind(m, session, buyer, lead);
    await m.query(
      "INSERT INTO evento_perfil(id_buyer,id_lead,id_sesion,tipo,origen,despues,clave) VALUES($1,$2,$3,'captacion',$4,$5::jsonb,$6)",
      [
        buyer,
        lead,
        session.id_sesion,
        dto.fuente,
        JSON.stringify(dto),
        dto.clave,
      ],
    );
    // Explicit form data fills only an empty field of a new/unconfirmed profile.
    if (buyer && !owner && dto.universidad)
      await m.query('UPDATE buyer SET universidad_otra=$2,procedencia_campos=procedencia_campos || $3::jsonb WHERE id_buyer=$1', [
        buyer,
        dto.universidad,
        JSON.stringify({'perfilAcademico.universidadOtra':{origen:dto.fuente,confirmado:true}}),
      ]);
    return { session, buyer, lead };
  }
  async capture(token: string, dto: CaptureProfileDto) {
    const result = await this.db.transaction((m) =>
      this.captureIn(m, token, dto),
    );
    return { ok: true, token: result.session.token };
  }
  async generalAvailability(fecha: string) {
    const slots = this.journeys.slots(fecha);
    const occupied = await this.db.query(
      "SELECT fecha_inicio FROM reunion WHERE estado='confirmada' AND fecha_inicio=ANY($1::timestamptz[])",
      [slots],
    );
    const booked = new Set(
      occupied.map((r: any) => new Date(r.fecha_inicio).toISOString()),
    );
    return {
      horarios: slots.filter((s) => !booked.has(s)),
      desde: new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10),
      hasta: new Date(Date.now() + 29 * 86400000 - 5 * 3600000)
        .toISOString()
        .slice(0, 10),
    };
  }
  async book(token: string, dto: GeneralMeetingDto) {
    if (!dto.nombres?.trim() || !dto.telefono?.trim() || !dto.correo?.trim())
      throw new BadRequestException(
        'Indica nombre, WhatsApp y correo para reservar.',
      );
    return this.db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        'meeting:' + dto.clave,
      ]);
      const {
        session,
        buyer,
        lead: found,
      } = await this.captureIn(m, token, dto);
      const [prior] = await m.query(
        'SELECT * FROM reunion WHERE clave_idempotencia=$1',
        [dto.clave],
      );
      if (prior) {
        if (
          new Date(prior.fecha_inicio).toISOString() !==
          new Date(dto.fechaInicio).toISOString()
        )
          throw new ConflictException('La solicitud ya tiene una reserva.');
        return {
          ok: true,
          token: session.token,
          fechaInicio: prior.fecha_inicio,
        };
      }
      const iso = new Date(dto.fechaInicio).toISOString();
      if (
        !this.journeys
          .slots(
            new Date(Date.parse(iso) - 5 * 3600000).toISOString().slice(0, 10),
          )
          .includes(iso)
      )
        throw new BadRequestException('Horario no disponible.');
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        'slot:' + iso,
      ]);
      if (
        (
          await m.query(
            "SELECT 1 FROM reunion WHERE fecha_inicio=$1 AND estado='confirmada'",
            [iso],
          )
        ).length
      )
        throw new ConflictException(
          'Ese horario acaba de reservarse. Elige otro.',
        );
      let lead = found;
      if (!lead) {
        const [b] = await m.query(
          'SELECT * FROM buyer WHERE id_buyer=$1 FOR UPDATE',
          [buyer],
        );
        await this.identity.releaseBuyer(m, buyer);
        const [l] = await m.query(
          "INSERT INTO lead(nombres,correo,telefono,id_estado,id_sesion_origen,procedencia_campos) VALUES($1,$2,$3,(SELECT id_estado FROM estado_lead WHERE codigo='nuevo'),$4,$5) RETURNING id_lead",
          [
            b.nombres,
            b.correo,
            b.telefono,
            session.id_sesion,
            b.procedencia_campos,
          ],
        );
        lead = l.id_lead;
        await m.query(
          'INSERT INTO perfil_academico(id_lead,id_universidad,universidad_otra,id_grado,condicion) VALUES($1,$2,$3,$4,$5)',
          [lead, b.id_universidad, b.universidad_otra, b.id_grado, b.condicion],
        );
        if (b.id_etapa)
          await m.query(
            'INSERT INTO proyecto_tesis(id_lead,id_etapa,observaciones) VALUES($1,$2,$3)',
            [lead, b.id_etapa, b.notas],
          );
        await m.query(
          "UPDATE buyer SET estado='lead',id_lead=$2,fecha_conversion=now() WHERE id_buyer=$1",
          [buyer, lead],
        );
        await m.query(
          'UPDATE solicitud_recurso SET id_lead=$2 WHERE id_buyer=$1',
          [buyer, lead],
        );
        await this.identity.converted(m, buyer, lead);
      }
      await this.bind(m, { ...session, id_lead: lead }, buyer, lead);
      await m.query(
        "INSERT INTO reunion(id_reunion,id_lead,id_sesion,clave_idempotencia,fecha_inicio,fecha_fin,nombres,telefono,correo,universidad,descripcion) VALUES($1,$2,$3,$4,$5,$5::timestamptz+interval '30 minutes',$6,$7,$8,$9,$10)",
        [
          randomUUID(),
          lead,
          session.id_sesion,
          dto.clave,
          iso,
          dto.nombres,
          normalizeContactPhone(dto.telefono),
          dto.correo,
          dto.universidad || null,
          dto.descripcion || null,
        ],
      );
      await m.query(
        'UPDATE lead SET reserva_pendiente=false,revision=revision+1,updated_at=now() WHERE id_lead=$1',
        [lead],
      );
      return { ok: true, token: session.token, fechaInicio: iso };
    });
  }
  private async conversation(m: EntityManager, session: any) {
    const [c] = await m.query(
      "INSERT INTO conversacion(id_sesion,id_lead,canal) VALUES($1,$2,'web_chat') ON CONFLICT(id_sesion) WHERE id_sesion IS NOT NULL AND cerrada_en IS NULL DO UPDATE SET id_sesion=excluded.id_sesion RETURNING *",
      [session.id_sesion, session.id_lead],
    );
    return c;
  }
  async reset(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) return { ok: true };
    return this.db.transaction(async (m) => {
      const [session] = await m.query(
        'SELECT id_sesion FROM acceso_contacto WHERE token_hash=$1 AND expires_at>now() FOR UPDATE',
        [digest(token)],
      );
      if (session)
        await m.query(
          "UPDATE conversacion SET estado='cerrada',cerrada_en=now() WHERE id_sesion=$1 AND cerrada_en IS NULL",
          [session.id_sesion],
        );
      return { ok: true };
    });
  }
  async begin(token: string, dto: TesiBeginDto) {
    return this.db.transaction(async (m) => {
      const session = await this.session(m, token);
      const c = await this.conversation(m, session);
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        'turn:' + dto.idTurno,
      ]);
      const [prior] = await m.query(
        'SELECT t.*,m.contenido FROM turno_tesi t JOIN mensaje m USING(id_mensaje) WHERE id_turno=$1',
        [dto.idTurno],
      );
      if (prior) {
        if (
          prior.id_conversacion !== c.id_conversacion ||
          prior.contenido !== dto.mensaje
        )
          throw new ConflictException('Turno no disponible.');
        if (prior.respuesta)
          return { token: session.token, resultado: prior.respuesta };
      }
      const [previous] = await m.query(
        'SELECT respuesta FROM turno_tesi WHERE id_conversacion=$1 AND respuesta IS NOT NULL AND id_turno<>$2 ORDER BY created_at DESC,id_turno DESC LIMIT 1',
        [c.id_conversacion, dto.idTurno],
      );
      const [previousQualification] = await m.query('SELECT resultado FROM calificacion_tesi WHERE id_conversacion=$1 ORDER BY id_calificacion DESC LIMIT 1', [c.id_conversacion]);
      const historyRows = (
        await m.query(
          'SELECT id_mensaje,remitente,contenido FROM mensaje WHERE id_conversacion=$1 AND ($2::bigint IS NULL OR id_mensaje<>$2::bigint) ORDER BY id_mensaje DESC LIMIT 12',
          [c.id_conversacion, prior?.id_mensaje || null],
        )
      ).reverse();
      const evidenceHistory = historyRows.filter((item: any) => item.remitente === 'lead').map((item: any) => ({ idMensaje: item.id_mensaje, text: item.contenido }));
      const history = historyRows.map((m: any) => ({
          role: m.remitente === 'lead' ? 'user' : 'assistant',
          text: m.contenido,
        }));
      if (prior)
        return {
          token: session.token,
          resultado: null,
          estado: previous?.respuesta?.state || null,
          history,
          calificacionAnterior: previousQualification?.resultado || null,
          evidencias: [...evidenceHistory, { idMensaje: prior.id_mensaje, text: dto.mensaje }],
        };
      const [msg] = await m.query(
        "INSERT INTO mensaje(id_conversacion,remitente,contenido) VALUES($1,'lead',$2) RETURNING id_mensaje",
        [c.id_conversacion, dto.mensaje],
      );
      await m.query(
        'INSERT INTO turno_tesi(id_turno,id_conversacion,id_mensaje) VALUES($1,$2,$3)',
        [dto.idTurno, c.id_conversacion, msg.id_mensaje],
      );
      return {
        token: session.token,
        resultado: null,
        estado: previous?.respuesta?.state || null,
        history,
        calificacionAnterior: previousQualification?.resultado || null,
        evidencias: [...evidenceHistory, { idMensaje: msg.id_mensaje, text: dto.mensaje }],
      };
    });
  }
  async finish(token: string, dto: TesiFinishDto) {
    let result: any;
    try {
      result = JSON.parse(dto.resultadoJson);
    } catch {
      throw new BadRequestException('Resultado inválido.');
    }
    if (
      !result?.state ||
      typeof result.state !== 'object' ||
      result.reply !== dto.respuesta
    )
      throw new BadRequestException('Resultado inválido.');
    return this.db.transaction(async (m) => {
      const [session] = await m.query(
        'SELECT * FROM acceso_contacto WHERE token_hash=$1 AND expires_at>now() FOR UPDATE',
        [digest(token)],
      );
      if (!session) throw new UnauthorizedException('Sesión expirada.');
      const [turn] = await m.query(
        'SELECT t.*,c.id_sesion,m.contenido FROM turno_tesi t JOIN conversacion c USING(id_conversacion) JOIN mensaje m USING(id_mensaje) WHERE id_turno=$1 FOR UPDATE OF t',
        [dto.idTurno],
      );
      if (
        !turn ||
        turn.id_sesion !== session.id_sesion ||
        turn.contenido !== dto.mensaje
      )
        throw new ConflictException('Turno no disponible.');
      if (turn.respuesta) return { ok: true, resultado: turn.respuesta };
      const [previous] = await m.query(
        'SELECT respuesta FROM turno_tesi WHERE id_conversacion=$1 AND respuesta IS NOT NULL AND id_turno<>$2 AND created_at<=$3 ORDER BY created_at DESC,id_turno DESC LIMIT 1',
        [turn.id_conversacion, dto.idTurno, turn.created_at],
      );
      const interpretation = result.interpretacionR7;
      if (interpretation) {
        const qualification = await this.qualification.evaluate(m, turn.id_conversacion, dto.idTurno, session.id_lead, session.id_buyer, result.interpretacionR7, result.state.packageVersion);
        result.calificacion = qualification;
        delete result.interpretacionR7;
        if (!qualification.suficiente || !qualification.servicio || result.state.service !== qualification.servicio) {
          result.proposal = null;
          result.state.service = null;
          if (!result.state.humanRequested) {
            result.reply = !qualification.campos.necesidad ? '¿Qué necesitas resolver en tu tesis?' : !qualification.campos.etapa ? '¿En qué etapa se encuentra tu tesis?' : 'Un asesor puede revisar qué servicio se ajusta a tu caso.';
            result.quickReplies = [];
          }
        }
        if (qualification.campos.necesidad?.tipo === 'inferido' && !result.state.humanRequested && typeof qualification.campos.necesidad.valor === 'string' && qualification.campos.necesidad.valor.length <= 90) {
          result.quickReplies = [...(Array.isArray(result.quickReplies) ? result.quickReplies : []).slice(0, 3), `Confirmo: ${qualification.campos.necesidad.valor}`];
        }
      }
      await m.query(
        "INSERT INTO mensaje(id_conversacion,remitente,contenido) VALUES($1,'agente_ia',$2)",
        [turn.id_conversacion, result.reply],
      );
      for (const field of [
        'name',
        'university',
        'degree',
        'thesisStage',
        'need',
        'deadline',
        'service',
        'objections',
        'buyIntent',
      ]) {
        const value = result.state[field];
        const fieldMap: Record<string, string> = { need: 'necesidad', thesisStage: 'etapa', deadline: 'urgencia', service: 'servicio' };
        const evidenceItem = interpretation?.campos?.[fieldMap[field]];
        if (interpretation && (!evidenceItem || JSON.stringify(evidenceItem.valor) !== JSON.stringify(value))) continue;
        if (
          value === null ||
          value === undefined ||
          value === '' ||
          (Array.isArray(value) && !value.length) ||
          (value === false && previous?.respuesta?.state?.[field] !== true)
        )
          continue;
        if (
          JSON.stringify(previous?.respuesta?.state?.[field]) ===
          JSON.stringify(value)
        )
          continue;
        await m.query(
          'INSERT INTO sugerencia_perfil(id_lead,id_buyer,id_conversacion,id_mensaje,campo,valor) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(id_mensaje,campo) DO NOTHING',
          [
            session.id_lead,
            session.id_buyer,
            turn.id_conversacion,
            evidenceItem?.evidencias?.[0]?.idMensaje || turn.id_mensaje,
            field,
            JSON.stringify(value),
          ],
        );
      }
      await m.query(
        'UPDATE turno_tesi SET respuesta=$2::jsonb WHERE id_turno=$1',
        [dto.idTurno, JSON.stringify(result)],
      );
      await m.query(
        'UPDATE sesion_landing SET tuvo_interaccion=true WHERE id_sesion=$1',
        [session.id_sesion],
      );
      return { ok: true, resultado: result };
    });
  }
}
