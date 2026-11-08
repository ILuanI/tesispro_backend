import { PaymentVerificationService } from './payment-verification.service.js';
import { PaymentSchedulesService } from './payment-schedules.service.js';
import { SchedulePreviewDto } from './payment-schedules.dto.js';
import { LeadProfileService } from './lead-profile.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  AbonoDto,
  CronogramaDto,
  KpiRangeDto,
  LeadDto,
  ListDto,
  PreviewDto,
  ResolverPagoDto,
} from './admin.dto.js';
import { cents, decimal, monthlySchedule } from './money.js';
import {
  CanalContacto,
  MetodoPago,
  ModalidadServicio,
} from '../../common/enums/database.enums.js';
import {
  makeKpi,
  makeRatioKpi,
  positiveSatisfactionDefinition,
} from './impulse-kpi.js';
import { ContractListDto } from './contracts.dto.js';
import { profileJourneyFilter } from './journey-filters.js';

type Row = Record<string, any>;
const camel = (row: Row): Row =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      value,
    ]),
  );
const map = (rows: Row[]) => rows.map(camel);
const limaDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T12:00:00-05:00`);
  date.setDate(date.getDate() + days);
  return limaDate(date);
};
const number = (value: unknown) => Number(value ?? 0);
const cuotaSql = `SELECT c.id_cuota,c.id_cronograma,c.nro_cuota,c.monto, c.fecha_vencimiento::text AS fecha_vencimiento, cp.id_contrato, cp.moneda,c.id_version,
  ct.id_lead, l.nombres, l.apellidos, l.correo,
  COALESCE(a.abonado,0)::numeric(10,2)::text AS abonado,
  (c.monto-COALESCE(a.abonado,0))::numeric(10,2)::text AS saldo,
  CASE WHEN COALESCE(a.abonado,0)>=c.monto THEN 'pagada' WHEN COALESCE(a.abonado,0)>0 THEN 'parcial' ELSE 'pendiente' END AS estado,
  ((v.historico OR v.estado IN ('negociado','en_ejecucion')) AND c.fecha_vencimiento < (now() AT TIME ZONE 'America/Lima')::date AND c.monto>COALESCE(a.abonado,0)) AS vencida,
  (c.fecha_vencimiento = (now() AT TIME ZONE 'America/Lima')::date AND c.monto>COALESCE(a.abonado,0)) AS vence_hoy,
  v.estado AS estado_cronograma
  FROM cuota_pago c JOIN cronograma_pago cp ON cp.id_cronograma=c.id_cronograma AND cp.id_version_actual=c.id_version
  JOIN cronograma_version v ON v.id_version=c.id_version
  JOIN contrato ct ON ct.id_contrato=cp.id_contrato JOIN lead l ON l.id_lead=ct.id_lead
  LEFT JOIN (SELECT id_cuota,sum(monto) AS abonado FROM pago_neto WHERE estado='confirmado' GROUP BY id_cuota) a USING(id_cuota)`;
const cuotaHistorySql = cuotaSql.replace(
  ' AND cp.id_version_actual=c.id_version',
  '',
);
const contratoSql = `SELECT c.*, l.nombres, l.apellidos, l.correo, p.moneda,p.monto_total, cp.id_cronograma,
  EXISTS(SELECT 1 FROM pago WHERE id_contrato=c.id_contrato) AS tiene_pagos,
  (SELECT COALESCE(sum(monto),0)::numeric(10,2)::text FROM pago_neto WHERE id_contrato=c.id_contrato AND estado='confirmado') AS total_pagado,
  (SELECT COALESCE(sum(monto),0)::numeric(10,2)::text FROM pago_neto WHERE id_contrato=c.id_contrato AND estado='confirmado' AND id_cuota IS NULL) AS cobros_previos,
  (p.monto_total-(SELECT COALESCE(sum(monto),0) FROM pago_neto WHERE id_contrato=c.id_contrato AND estado='confirmado'))::numeric(10,2)::text AS saldo,
  (SELECT count(*)::int FROM pago WHERE id_contrato=c.id_contrato AND estado='pendiente' AND id_cuota IS NULL) AS pagos_pendientes
  FROM contrato c JOIN lead l ON l.id_lead=c.id_lead JOIN propuesta p ON p.id_propuesta=c.id_propuesta
  LEFT JOIN cronograma_pago cp ON cp.id_contrato=c.id_contrato`;

class Filters {
  clauses: string[] = [];
  values: any[] = [];
  add(expression: string, value: any) {
    this.values.push(value);
    this.clauses.push(expression.replaceAll('?', `$${this.values.length}`));
  }
  sql() {
    return this.clauses.length ? ` WHERE ${this.clauses.join(' AND ')}` : '';
  }
}

@Injectable()
export class AdminService {
  constructor(
    private readonly db: DataSource,
    private readonly profiles: LeadProfileService,
    private readonly schedules: PaymentSchedulesService,
  ) {}
  private async paged(sql: string, f: Filters, dto: ListDto, order: string) {
    if (dto.desde && dto.hasta && dto.desde > dto.hasta)
      throw new BadRequestException('El rango de fechas es inválido.');
    const [{ total }] = await this.db.query(
      `SELECT count(*)::int AS total FROM (${sql}) x${f.sql()}`,
      f.values,
    );
    const items = await this.db.query(
      `SELECT * FROM (${sql}) x${f.sql()} ORDER BY ${order} ${dto.direction === 'asc' ? 'ASC' : 'DESC'}, 1 ASC LIMIT $${f.values.length + 1} OFFSET $${f.values.length + 2}`,
      [...f.values, dto.pageSize, (dto.page - 1) * dto.pageSize],
    );
    return { items: map(items), total, page: dto.page, pageSize: dto.pageSize };
  }
  async catalogos() {
    const [estados, responsables] = await Promise.all([
      this.db.query('SELECT * FROM estado_lead ORDER BY orden'),
      this.db.query(
        'SELECT id_usuario,nombres,apellidos FROM usuario_interno WHERE activo=true ORDER BY nombres',
      ),
    ]);
    return {
      estados: map(estados),
      responsables: map(responsables),
      canales: Object.values(CanalContacto),
      modalidades: Object.values(ModalidadServicio),
      metodos: Object.values(MetodoPago),
    };
  }
  leads(dto: ListDto) {
    const f = new Filters();
    const activity = profileJourneyFilter(dto, f.values, 'x.id_lead', 'lead');
    if (activity) f.clauses.push(activity);
    if (dto.q)
      f.add(
        "(concat_ws(' ',nombres,apellidos) ILIKE ? OR correo ILIKE ? OR telefono ILIKE ?)",
        `%${dto.q}%`,
      );
    if (dto.estado) {
      if (!/^\d+$/.test(dto.estado))
        throw new BadRequestException('Estado de lead inválido.');
      f.add('id_estado=?', Number(dto.estado));
    }
    if (dto.responsable === 'sin_asignar')
      f.clauses.push('id_responsable IS NULL');
    else if (dto.responsable)
      f.add('id_responsable=?', Number(dto.responsable));
    if (dto.idEtapa)
      f.add(
        'EXISTS(SELECT 1 FROM proyecto_tesis p WHERE p.id_lead=x.id_lead AND p.id_etapa=?)',
        dto.idEtapa,
      );
    if (dto.idNecesidad)
      f.add(
        'EXISTS(SELECT 1 FROM proyecto_tesis p JOIN proyecto_necesidad pn USING(id_proyecto) WHERE p.id_lead=x.id_lead AND pn.id_necesidad=?)',
        dto.idNecesidad,
      );
    if (dto.origen)
      f.add(
        '(EXISTS(SELECT 1 FROM sesion_landing sl WHERE sl.id_sesion=x.id_sesion_origen AND coalesce(sl.utm_source,sl.canal_origen::text)=?) OR EXISTS(SELECT 1 FROM solicitud_recurso sr WHERE sr.id_lead=x.id_lead AND sr.canal=?) OR EXISTS(SELECT 1 FROM evento_perfil ep JOIN sesion_landing sl ON sl.id_sesion=ep.id_sesion WHERE ep.id_lead=x.id_lead AND coalesce(sl.utm_source,sl.canal_origen::text)=?))',
        dto.origen,
      );
    if (dto.canal) f.add('canal_preferido=?', dto.canal);
    if (dto.desde)
      f.add(
        "fecha_registro >= (?::date::timestamp AT TIME ZONE 'America/Lima')",
        dto.desde,
      );
    if (dto.hasta)
      f.add(
        "fecha_registro < ((?::date+1)::timestamp AT TIME ZONE 'America/Lima')",
        dto.hasta,
      );
    const order = {
      nombres: 'nombres',
      estado: 'estado_nombre',
      fechaRegistro: 'fecha_registro',
    }[dto.sort || 'fechaRegistro'];
    if (!order)
      throw new BadRequestException('Ordenamiento inválido para leads.');
    return this.paged(
      `SELECT l.*,e.nombre AS estado_nombre,e.codigo AS estado_codigo,concat_ws(' ',u.nombres,u.apellidos) AS responsable_nombre
      FROM lead l JOIN estado_lead e USING(id_estado) LEFT JOIN usuario_interno u ON u.id_usuario=l.id_responsable`,
      f,
      dto,
      order,
    );
  }
  async lead(id: string) {
    const [lead] = await this.db.query(
      `SELECT l.*,l.fecha_nacimiento::text AS fecha_nacimiento,e.nombre AS estado_nombre,
      concat_ws(' ',u.nombres,u.apellidos) AS responsable_nombre FROM lead l JOIN estado_lead e USING(id_estado)
      LEFT JOIN usuario_interno u ON u.id_usuario=l.id_responsable WHERE id_lead=$1`,
      [id],
    );
    if (!lead) throw new NotFoundException('Lead no encontrado.');
    const [perfil] = await this.db.query(
      `SELECT pa.*,COALESCE(un.nombre,pa.universidad_otra) AS universidad_nombre,
      pr.nombre AS programa_nombre,g.nombre AS grado_nombre FROM perfil_academico pa
      LEFT JOIN universidad un ON un.id_universidad=pa.id_universidad LEFT JOIN programa_academico pr ON pr.id_programa=pa.id_programa
      LEFT JOIN grado_academico g ON g.id_grado=pa.id_grado WHERE pa.id_lead=$1`,
      [id],
    );
    return {
      ...camel(lead),
      perfilAcademico: perfil ? camel(perfil) : null,
      ...(await this.profiles.enrich(id)),
    };
  }
  async historial(id: string) {
    await this.lead(id);
    return map(
      await this.db.query(
        `SELECT h.*,e.nombre AS estado_nombre,concat_ws(' ',u.nombres,u.apellidos) AS usuario_nombre
      FROM lead_estado_historial h JOIN estado_lead e USING(id_estado) LEFT JOIN usuario_interno u USING(id_usuario)
      WHERE id_lead=$1 ORDER BY fecha DESC,id_historial DESC`,
        [id],
      ),
    );
  }
  private context(m: EntityManager, user: number, motivo: string) {
    return m.query(
      "SELECT set_config('app.admin_usuario',$1,true),set_config('app.admin_motivo',$2,true)",
      [String(user), motivo],
    );
  }
  saveLead(dto: LeadDto, user: number, id?: string) {
    return this.profiles.save(dto, user, id);
  }
  contratos(dto: ContractListDto) {
    const f = new Filters();
    if (dto.q)
      f.add(
        "(concat_ws(' ',nombres,apellidos) ILIKE ? OR correo ILIKE ? OR id_contrato::text=?)",
        /^\d+$/.test(dto.q) ? dto.q : `%${dto.q}%`,
      );
    if (dto.moneda) f.add('moneda=?', dto.moneda);
    if (dto.desde)
      f.add(
        "(fecha_firma AT TIME ZONE 'America/Lima')::date>=?::date",
        dto.desde,
      );
    if (dto.hasta)
      f.add(
        "(fecha_firma AT TIME ZONE 'America/Lima')::date<=?::date",
        dto.hasta,
      );
    if (dto.planificacion)
      f.add(
        '(id_cronograma IS NOT NULL)=?::boolean',
        dto.planificacion === 'con',
      );
    return this.paged(contratoSql, f, dto, 'id_contrato');
  }
  async contrato(id: number, m: EntityManager = this.db.manager, lock = false) {
    if (lock) {
      const [row] = await m.query(
        'SELECT id_contrato FROM contrato WHERE id_contrato=$1 FOR UPDATE',
        [id],
      );
      if (!row) throw new NotFoundException('Contrato no encontrado.');
    }
    const [row] = await m.query(`${contratoSql} WHERE c.id_contrato=$1`, [id]);
    if (!row) throw new NotFoundException('Contrato no encontrado.');
    return row;
  }
  async cronograma(id: number) {
    const contract = await this.contrato(id);
    const [cronograma] = await this.db.query(
      'SELECT * FROM cronograma_pago WHERE id_contrato=$1',
      [id],
    );
    const cuotas = await this.db.query(
      `SELECT * FROM (${cuotaSql}) x WHERE id_contrato=$1 ORDER BY nro_cuota`,
      [id],
    );
    const previos = await this.db.query(
      'SELECT * FROM pago WHERE id_contrato=$1 AND id_cuota IS NULL ORDER BY created_at DESC',
      [id],
    );
    return {
      contrato: camel(contract),
      cronograma: cronograma ? camel(cronograma) : null,
      cuotas: map(cuotas),
      cobrosPrevios: map(previos),
      perfilPagos: await this.schedules.detail(id),
    };
  }
  async preview(id: number, dto: SchedulePreviewDto) {
    return this.schedules.preview(id, dto);
  }
  async saveCronograma(
    id: number,
    dto: CronogramaDto,
    user: number,
    _edit = false,
  ) {
    return this.schedules.save(id, dto, user);
  }
  cuotas(dto: ListDto) {
    const f = new Filters();
    if (dto.q)
      f.add(
        "(concat_ws(' ',nombres,apellidos) ILIKE ? OR correo ILIKE ? OR id_contrato::text ILIKE ?)",
        `%${dto.q}%`,
      );
    if (dto.contrato) f.add('id_contrato=?', dto.contrato);
    if (dto.estado) {
      if (!['pendiente', 'parcial', 'pagada'].includes(dto.estado))
        throw new BadRequestException('Estado de cuota inválido.');
      f.add('estado=?', dto.estado);
    }
    if (dto.moneda) f.add('moneda=?', dto.moneda);
    if (dto.vencida) f.add('vencida=?', dto.vencida === 'true');
    if (dto.venceHoy) f.add('vence_hoy=?', dto.venceHoy === 'true');
    if (dto.desde) f.add('fecha_vencimiento>=?', dto.desde);
    if (dto.hasta) f.add('fecha_vencimiento<=?', dto.hasta);
    const order = {
      fechaVencimiento: 'fecha_vencimiento',
      monto: 'monto',
      idContrato: 'id_contrato',
    }[dto.sort || 'fechaVencimiento'];
    if (!order)
      throw new BadRequestException('Ordenamiento inválido para cuotas.');
    // monto is numeric inside the subquery; saldo and abonado are decimal strings in the response.
    return this.paged(cuotaSql, f, dto, order);
  }
  async abonos(id: number) {
    const [cuota] = await this.db.query(
      `SELECT * FROM (${cuotaHistorySql}) x WHERE id_cuota=$1`,
      [id],
    );
    if (!cuota) throw new NotFoundException('Cuota no encontrada.');
    return {
      cuota: camel(cuota),
      items: map(
        await this.db.query(
          `SELECT p.*,concat_ws(' ',u.nombres,u.apellidos) AS usuario_nombre FROM pago p
      LEFT JOIN usuario_interno u ON u.id_usuario=p.id_usuario_registro WHERE id_cuota=$1 ORDER BY fecha_pago DESC,id_pago DESC`,
          [id],
        ),
      ),
    };
  }
  private kpiRange(dto: KpiRangeDto) {
    const hasta = dto.hasta || limaDate();
    const desde = dto.desde || addDays(hasta, -29);
    if (desde > hasta)
      throw new BadRequestException('El rango de fechas es inválido.');
    return { desde, hasta };
  }
  async impulseKpis(dto: KpiRangeDto) {
    const range = this.kpiRange(dto);
    const params = [range.desde, range.hasta];
    const [
      [publication],
      [landing],
      [leadStats],
      [chat],
      [payers],
      [proposalStats],
      [conversion],
      platformRows,
      leadDayRows,
      universityRows,
      cycleRows,
      stageRows,
      proposalStateRows,
      followUpRows,
    ] = await Promise.all([
      this.db.query(
        `SELECT COALESCE(sum(clics),0)::int AS clicks, COALESCE(sum(impresiones),0)::int AS impressions
        FROM publicacion
        WHERE estado='publicada'
          AND fecha_publicacion >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND fecha_publicacion < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')`,
        params,
      ),
      this.db.query(
        `SELECT count(*)::int AS visits,
          count(*) FILTER(WHERE tuvo_interaccion)::int AS interactions,
          count(*) FILTER(WHERE visito_formulario)::int AS form_visits,
          count(*) FILTER(WHERE completo_formulario)::int AS completed_forms
        FROM sesion_landing
        WHERE fecha >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND fecha < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')`,
        params,
      ),
      this.db.query(
        `SELECT count(*)::int AS leads,
          count(*) FILTER(WHERE cumple_perfil_objetivo)::int AS target_leads
        FROM lead
        WHERE fecha_registro >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND fecha_registro < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')`,
        params,
      ),
      this.db.query(
        `SELECT count(tiempo_respuesta_ms)::int AS response_count,
          ROUND((avg(tiempo_respuesta_ms) / 1000.0)::numeric,2)::float AS avg_response_seconds,
          count(*) FILTER(WHERE calificacion_positiva IS NOT NULL)::int AS ratings,
          count(*) FILTER(WHERE calificacion_positiva=true)::int AS positive_ratings
        FROM mensaje
        WHERE remitente='agente_ia'
          AND enviado_en >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND enviado_en < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')`,
        params,
      ),
      this.db.query(
        `SELECT count(DISTINCT p.id_lead)::int AS payers
        FROM pago_neto p
        WHERE p.estado='confirmado'
          AND COALESCE(p.fecha_pago,p.created_at) >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND COALESCE(p.fecha_pago,p.created_at) < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')`,
        params,
      ),
      this.db.query(
        `SELECT count(*) FILTER(WHERE estado <> 'borrador')::int AS sent,
          count(*) FILTER(WHERE estado='aceptada')::int AS accepted
        FROM propuesta
        WHERE fecha_envio >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND fecha_envio < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')`,
        params,
      ),
      this.db.query(
        `WITH first_payment AS (
          SELECT ct.id_propuesta, min(COALESCE(p.fecha_pago,p.created_at)) AS paid_at
          FROM pago_neto p JOIN contrato ct ON ct.id_contrato=p.id_contrato
          WHERE p.estado='confirmado'
          GROUP BY ct.id_propuesta
        )
        SELECT count(*)::int AS converted,
          ROUND(avg(EXTRACT(EPOCH FROM (fp.paid_at - pr.fecha_envio)) / 86400.0)::numeric,2)::float AS avg_days
        FROM first_payment fp JOIN propuesta pr ON pr.id_propuesta=fp.id_propuesta
        WHERE pr.fecha_envio IS NOT NULL
          AND fp.paid_at >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND fp.paid_at < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')`,
        params,
      ),
      this.db.query(
        `SELECT pl.nombre, COALESCE(sum(pub.clics),0)::int AS clicks,
          COALESCE(sum(pub.impresiones),0)::int AS impressions
        FROM publicacion pub
        JOIN cuenta_red_social c USING(id_cuenta)
        JOIN plataforma pl USING(id_plataforma)
        WHERE pub.estado='publicada'
          AND pub.fecha_publicacion >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND pub.fecha_publicacion < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')
        GROUP BY pl.id_plataforma, pl.nombre
        ORDER BY pl.nombre`,
        params,
      ),
      this.db.query(
        `SELECT (fecha_registro AT TIME ZONE 'America/Lima')::date::text AS date,
          count(*)::int AS total
        FROM lead
        WHERE fecha_registro >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND fecha_registro < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')
        GROUP BY 1 ORDER BY 1`,
        params,
      ),
      this.db.query(
        `SELECT COALESCE(u.siglas,u.nombre,pa.universidad_otra,'Sin universidad') AS label,
          count(*)::int AS total
        FROM lead l
        LEFT JOIN perfil_academico pa USING(id_lead)
        LEFT JOIN universidad u ON u.id_universidad=pa.id_universidad
        WHERE l.fecha_registro >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND l.fecha_registro < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')
        GROUP BY 1 ORDER BY total DESC, label LIMIT 8`,
        params,
      ),
      this.db.query(
        `SELECT COALESCE(pa.ciclo::text,'Sin ciclo') AS label, count(*)::int AS total
        FROM lead l LEFT JOIN perfil_academico pa USING(id_lead)
        WHERE l.fecha_registro >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND l.fecha_registro < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')
        GROUP BY 1 ORDER BY total DESC, label LIMIT 8`,
        params,
      ),
      this.db.query(
        `SELECT COALESCE(et.nombre,'Sin etapa') AS label, count(*)::int AS total
        FROM lead l
        LEFT JOIN proyecto_tesis pt USING(id_lead)
        LEFT JOIN etapa_tesis et ON et.id_etapa=pt.id_etapa
        WHERE l.fecha_registro >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND l.fecha_registro < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')
        GROUP BY 1 ORDER BY total DESC, label LIMIT 8`,
        params,
      ),
      this.db.query(
        `SELECT estado AS label, count(*)::int AS total
        FROM propuesta
        WHERE created_at >= ($1::date::timestamp AT TIME ZONE 'America/Lima')
          AND created_at < (($2::date + 1)::timestamp AT TIME ZONE 'America/Lima')
        GROUP BY estado ORDER BY total DESC, estado`,
        params,
      ),
      this.db.query(
        `SELECT pr.id_propuesta,
          COALESCE(sd.servicio, 'Propuesta sin detalle') AS servicio,
          pr.monto_total::text AS monto, pr.moneda,
          pr.fecha_envio, l.id_lead, l.nombres, l.apellidos, l.correo,
          GREATEST(0, floor(EXTRACT(EPOCH FROM (now() - pr.fecha_envio)) / 86400))::int AS dias_transcurridos,
          s.fecha_programada, s.fecha_envio AS ultimo_envio, s.estado AS seguimiento_estado, s.resultado
        FROM propuesta pr
        JOIN lead l ON l.id_lead=pr.id_lead
        LEFT JOIN LATERAL (
          SELECT COALESCE(pd.descripcion, sv.nombre) AS servicio
          FROM propuesta_detalle pd
          LEFT JOIN servicio sv ON sv.id_servicio=pd.id_servicio
          WHERE pd.id_propuesta=pr.id_propuesta
          ORDER BY pd.id_detalle LIMIT 1
        ) sd ON true
        LEFT JOIN LATERAL (
          SELECT * FROM seguimiento s
          WHERE s.id_propuesta=pr.id_propuesta
          ORDER BY COALESCE(s.fecha_envio,s.fecha_programada) DESC, s.id_seguimiento DESC
          LIMIT 1
        ) s ON true
        WHERE pr.estado='enviada' AND pr.fecha_envio IS NOT NULL AND pr.fecha_respuesta IS NULL
        ORDER BY pr.fecha_envio ASC LIMIT 12`,
      ),
    ]);

    const leads = number(leadStats.leads);
    const kpis = [
      makeRatioKpi(
        'CTR',
        number(publication.clicks),
        number(publication.impressions),
      ),
      makeRatioKpi('TIL', number(landing.interactions), number(landing.visits)),
      makeRatioKpi(
        'TCL',
        number(landing.completed_forms),
        number(landing.form_visits),
      ),
      makeRatioKpi('LPO', number(leadStats.target_leads), leads),
      makeKpi(
        'TPR',
        chat.avg_response_seconds === null
          ? null
          : number(chat.avg_response_seconds),
        number(chat.response_count),
        null,
      ),
      makeRatioKpi('TSU', number(chat.positive_ratings), number(chat.ratings)),
      makeRatioKpi('TCP', number(payers.payers), leads),
      makeRatioKpi(
        'TAP',
        number(proposalStats.accepted),
        number(proposalStats.sent),
      ),
      makeKpi(
        'TPC',
        conversion.avg_days === null ? null : number(conversion.avg_days),
        number(conversion.converted),
        null,
      ),
    ];

    return {
      range,
      assumptions: {
        payer:
          'Lead con al menos un pago confirmado en pago.estado = confirmado.',
        satisfaction: positiveSatisfactionDefinition,
      },
      funnel: {
        buyers: number(landing.visits),
        leads,
        payers: number(payers.payers),
      },
      kpis,
      charts: {
        ctrByPlatform: (platformRows as Row[]).map((row) => ({
          label: row.nombre,
          clicks: number(row.clicks),
          impressions: number(row.impressions),
          value: makeRatioKpi(
            'CTR',
            number(row.clicks),
            number(row.impressions),
          ).value,
        })),
        leadsByDay: map(leadDayRows),
        leadsByUniversity: map(universityRows),
        leadsByCycle: map(cycleRows),
        leadsByStage: map(stageRows),
        proposalsByState: map(proposalStateRows),
      },
      pendingFollowUps: map(followUpRows),
    };
  }
  async resumen() {
    const [leads, estados, monedas, proximos, recientes] = await Promise.all([
      this.db.query(
        "SELECT count(*)::int AS total,count(*) FILTER(WHERE fecha_registro >= (now() AT TIME ZONE 'America/Lima')::date AT TIME ZONE 'America/Lima')::int AS hoy FROM lead",
      ),
      this.db.query(
        'SELECT e.nombre,e.codigo,count(l.id_lead)::int AS total FROM estado_lead e LEFT JOIN lead l USING(id_estado) GROUP BY e.id_estado ORDER BY e.orden',
      ),
      this.db
        .query(`SELECT moneda,sum(saldo::numeric)::numeric(10,2)::text AS pendiente,
        COALESCE(sum(saldo::numeric) FILTER(WHERE vencida),0)::numeric(10,2)::text AS vencido,
        (SELECT coalesce(sum(p.monto),0)::numeric(10,2)::text FROM pago_neto p WHERE p.estado='confirmado' AND p.moneda=x.moneda) AS cobrado FROM (${cuotaSql}) x GROUP BY moneda ORDER BY moneda`),
      this.db.query(
        `SELECT * FROM (${cuotaSql}) x WHERE saldo::numeric>0 ORDER BY fecha_vencimiento,id_cuota LIMIT 5`,
      ),
      this.db.query(
        'SELECT l.*,e.nombre AS estado_nombre FROM lead l JOIN estado_lead e USING(id_estado) ORDER BY fecha_registro DESC LIMIT 5',
      ),
    ]);
    const origenes = await this.db.query(
      "SELECT coalesce(nullif(s.utm_source,''),s.canal_origen::text,'administracion') AS origen,count(*)::int AS total FROM lead l LEFT JOIN sesion_landing s ON s.id_sesion=l.id_sesion_origen GROUP BY 1 ORDER BY total DESC",
    );
    const [seguimiento] = await this.db.query(
      "SELECT count(DISTINCT id_lead) FILTER(WHERE fecha_programada<now())::int AS vencidos,count(DISTINCT id_lead) FILTER(WHERE fecha_programada>=now())::int AS proximos FROM seguimiento WHERE estado='programado'",
    );
    return {
      origenes,
      seguimiento,
      leads: leads[0],
      estados: map(estados),
      monedas: map(monedas),
      proximos: map(proximos),
      recientes: map(recientes),
    };
  }
}
