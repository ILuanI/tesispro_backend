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
import { makeKpi, makeRatioKpi, positiveSatisfactionDefinition } from './impulse-kpi.js';
import { ContractListDto } from './contracts.dto.js';

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
const cuotaSql = `SELECT c.id_cuota,c.id_cronograma,c.nro_cuota,c.monto, c.fecha_vencimiento::text AS fecha_vencimiento, cp.id_contrato, cp.moneda,
  ct.id_lead, l.nombres, l.apellidos, l.correo,
  COALESCE(a.abonado,0)::numeric(10,2)::text AS abonado,
  (c.monto-COALESCE(a.abonado,0))::numeric(10,2)::text AS saldo,
  CASE WHEN COALESCE(a.abonado,0)>=c.monto THEN 'pagada' WHEN COALESCE(a.abonado,0)>0 THEN 'parcial' ELSE 'pendiente' END AS estado,
  (c.fecha_vencimiento < (now() AT TIME ZONE 'America/Lima')::date AND c.monto>COALESCE(a.abonado,0)) AS vencida
  FROM cuota_pago c JOIN cronograma_pago cp USING(id_cronograma)
  JOIN contrato ct ON ct.id_contrato=cp.id_contrato JOIN lead l ON l.id_lead=ct.id_lead
  LEFT JOIN (SELECT id_cuota,sum(monto) AS abonado FROM pago WHERE estado='confirmado' GROUP BY id_cuota) a USING(id_cuota)`;
const contratoSql = `SELECT c.*, l.nombres, l.apellidos, l.correo, p.moneda,p.monto_total, cp.id_cronograma,
  EXISTS(SELECT 1 FROM pago WHERE id_contrato=c.id_contrato) AS tiene_pagos,
  (SELECT COALESCE(sum(monto),0)::numeric(10,2)::text FROM pago WHERE id_contrato=c.id_contrato AND estado='confirmado') AS total_pagado,
  (SELECT COALESCE(sum(monto),0)::numeric(10,2)::text FROM pago WHERE id_contrato=c.id_contrato AND estado='confirmado' AND id_cuota IS NULL) AS cobros_previos,
  (p.monto_total-(SELECT COALESCE(sum(monto),0) FROM pago WHERE id_contrato=c.id_contrato AND estado='confirmado'))::numeric(10,2)::text AS saldo,
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
  constructor(private readonly db: DataSource) {}
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
    return { ...camel(lead), perfilAcademico: perfil ? camel(perfil) : null };
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
  async saveLead(dto: LeadDto, user: number, id?: string) {
    if (!dto.nombres.trim())
      throw new BadRequestException('Ingresa el nombre del lead.');
    const fields: Record<string, any> = {
      nombres: dto.nombres.trim(),
      apellidos: dto.apellidos?.trim() || null,
      correo: dto.correo.trim().toLowerCase(),
      telefono: dto.telefono.trim(),
      id_estado: dto.idEstado,
      id_responsable: dto.idResponsable || null,
      departamento: dto.departamento?.trim() || null,
      fecha_nacimiento: dto.fechaNacimiento || null,
      canal_preferido: dto.canalPreferido || null,
      modalidad_preferida: dto.modalidadPreferida || null,
      horario_preferido: dto.horarioPreferido || null,
      cumple_perfil_objetivo: dto.cumplePerfilObjetivo || false,
      nivel_interes: dto.nivelInteres || null,
    };
    return this.db.transaction(async (m) => {
      if (id) {
        const [current] = await m.query(
          'SELECT id_estado FROM lead WHERE id_lead=$1 FOR UPDATE',
          [id],
        );
        if (!current) throw new NotFoundException('Lead no encontrado.');
        if (current.id_estado !== dto.idEstado && !dto.motivo?.trim())
          throw new BadRequestException(
            'Indica el motivo del cambio de estado.',
          );
      }
      if (dto.idResponsable) {
        const [responsable] = await m.query(
          'SELECT id_usuario FROM usuario_interno WHERE id_usuario=$1 AND activo=true',
          [dto.idResponsable],
        );
        if (!responsable)
          throw new BadRequestException('El responsable no está activo.');
      }
      await this.context(m, user, dto.motivo || 'Lead creado desde el panel');
      const cols = Object.keys(fields),
        values = Object.values(fields);
      const sql = id
        ? `UPDATE lead SET ${cols.map((c, i) => `${c}=$${i + 1}`).join(',')} WHERE id_lead=$${values.length + 1} RETURNING *`
        : `INSERT INTO lead(${cols.join(',')}) VALUES(${values.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`;
      const [row] = await m.query(sql, id ? [...values, id] : values);
      return camel(row);
    });
  }
  contratos(dto: ContractListDto) {
    const f = new Filters();
    if (dto.q)
      f.add(
        "(concat_ws(' ',nombres,apellidos) ILIKE ? OR correo ILIKE ? OR id_contrato::text=?)",
        /^\d+$/.test(dto.q) ? dto.q : `%${dto.q}%`,
      );
    if (dto.moneda) f.add('moneda=?', dto.moneda);
    if (dto.desde) f.add("(fecha_firma AT TIME ZONE 'America/Lima')::date>=?::date", dto.desde);
    if (dto.hasta) f.add("(fecha_firma AT TIME ZONE 'America/Lima')::date<=?::date", dto.hasta);
    if (dto.planificacion) f.add('(id_cronograma IS NOT NULL)=?::boolean', dto.planificacion === 'con');
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
    };
  }
  private async programable(id: number, m: EntityManager, lock = false) {
    const contract = await this.contrato(id, m, lock);
    if (contract.id_cronograma)
      throw new ConflictException('Este contrato ya tiene un cronograma.');
    const [propuesta] = await m.query(
      'SELECT id_lead FROM propuesta WHERE id_propuesta=$1',
      [contract.id_propuesta],
    );
    if (propuesta.id_lead !== contract.id_lead)
      throw new BadRequestException(
        'La propuesta y el contrato deben pertenecer al mismo lead.',
      );
    const [bad] = await m.query(
      'SELECT id_pago FROM pago WHERE id_contrato=$1 AND (id_lead<>$2 OR moneda<>$3) LIMIT 1',
      [id, contract.id_lead, contract.moneda],
    );
    if (bad)
      throw new BadRequestException(
        'Hay pagos históricos con lead o moneda inconsistentes. Reconcílialos antes de programar.',
      );
    if (contract.pagos_pendientes)
      throw new BadRequestException(
        'Resuelve los pagos históricos pendientes antes de programar.',
      );
    if (Number(contract.saldo) <= 0)
      throw new BadRequestException(
        'Este contrato no tiene saldo para programar.',
      );
    return contract;
  }
  async preview(id: number, dto: PreviewDto) {
    const c = await this.programable(id, this.db.manager);
    return {
      cuotas: monthlySchedule(c.saldo, dto.cantidad, dto.primerVencimiento),
    };
  }
  async saveCronograma(
    id: number,
    dto: CronogramaDto,
    user: number,
    edit = false,
  ) {
    return this.db.transaction(async (m) => {
      const contract = edit
        ? await this.contrato(id, m, true)
        : await this.programable(id, m, true);
      const ordered = [...dto.cuotas].sort((a, b) => a.nroCuota - b.nroCuota);
      let sum = 0n;
      ordered.forEach((c, i) => {
        if (c.nroCuota !== i + 1 || cents(c.monto) <= 0n)
          throw new BadRequestException(
            'Las cuotas deben ser consecutivas y sus montos positivos.',
          );
        if (i && c.fechaVencimiento < ordered[i - 1].fechaVencimiento)
          throw new BadRequestException(
            'Los vencimientos deben estar en orden cronológico.',
          );
        sum += cents(c.monto);
      });
      let cronogramaId: number;
      if (edit) {
        const [schedule] = await m.query(
          'SELECT * FROM cronograma_pago WHERE id_contrato=$1',
          [id],
        );
        if (!schedule) throw new NotFoundException('Cronograma no encontrado.');
        if (sum !== cents(schedule.monto_programado))
          throw new BadRequestException(
            'La suma debe conservar el total programado.',
          );
        const current = await m.query(
          `SELECT c.*,EXISTS(SELECT 1 FROM pago p WHERE p.id_cuota=c.id_cuota) AS tiene_abonos
          FROM cuota_pago c WHERE id_cronograma=$1 ORDER BY nro_cuota FOR UPDATE`,
          [schedule.id_cronograma],
        );
        if (current.length !== ordered.length)
          throw new BadRequestException(
            'Conserva el número de cuotas del cronograma guardado.',
          );
        for (let i = 0; i < current.length; i++) {
          if (
            current[i].tiene_abonos &&
            cents(current[i].monto) !== cents(ordered[i].monto)
          )
            throw new BadRequestException(
              'Las cuotas con abonos solo permiten modificar su vencimiento.',
            );
          await m.query(
            'UPDATE cuota_pago SET monto=$1,fecha_vencimiento=$2 WHERE id_cuota=$3',
            [
              ordered[i].monto,
              ordered[i].fechaVencimiento,
              current[i].id_cuota,
            ],
          );
        }
        cronogramaId = schedule.id_cronograma;
      } else {
        if (sum !== cents(contract.saldo))
          throw new BadRequestException(
            'La suma de cuotas debe coincidir con el saldo del contrato.',
          );
        const [schedule] = await m.query(
          `INSERT INTO cronograma_pago(id_contrato,monto_programado,cobros_previos,moneda,id_usuario)
          VALUES($1,$2,$3,$4,$5) RETURNING id_cronograma`,
          [id, decimal(sum), contract.cobros_previos, contract.moneda, user],
        );
        cronogramaId = schedule.id_cronograma;
        for (const c of ordered)
          await m.query(
            'INSERT INTO cuota_pago(id_cronograma,nro_cuota,monto,fecha_vencimiento) VALUES($1,$2,$3,$4)',
            [cronogramaId, c.nroCuota, c.monto, c.fechaVencimiento],
          );
      }
      return { idCronograma: cronogramaId };
    });
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
      `SELECT * FROM (${cuotaSql}) x WHERE id_cuota=$1`,
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
  async addAbono(id: number, dto: AbonoDto, user: number) {
    const amount = cents(dto.monto);
    if (amount <= 0n)
      throw new BadRequestException('El abono debe ser positivo.');
    if (
      !dto.fechaPago.includes('T') ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(dto.fechaPago) ||
      new Date(dto.fechaPago).getTime() > Date.now() + 60_000
    )
      throw new BadRequestException(
        'Ingresa una fecha de pago con zona horaria que no esté en el futuro.',
      );
    return this.db.transaction(async (m) => {
      const [ref] = await m.query(
        'SELECT cp.id_contrato FROM cuota_pago c JOIN cronograma_pago cp USING(id_cronograma) WHERE id_cuota=$1',
        [id],
      );
      if (!ref) throw new NotFoundException('Cuota no encontrada.');
      await this.contrato(ref.id_contrato, m, true);
      const [existing] = await m.query(
        'SELECT * FROM pago WHERE clave_idempotencia=$1',
        [dto.claveIdempotencia],
      );
      if (existing) {
        if (
          existing.id_cuota !== id ||
          cents(existing.monto) !== amount ||
          existing.metodo !== dto.metodo ||
          new Date(existing.fecha_pago).getTime() !==
            new Date(dto.fechaPago).getTime() ||
          (existing.referencia_operacion || '') !==
            (dto.referenciaOperacion || '') ||
          (existing.comprobante_url || '') !== (dto.comprobanteUrl || '')
        )
          throw new ConflictException(
            'La solicitud de abono ya se utilizó con otros datos.',
          );
        return camel(existing);
      }
      await m.query(
        'SELECT id_cuota FROM cuota_pago WHERE id_cuota=$1 FOR UPDATE',
        [id],
      );
      const [cuota] = await m.query(
        `SELECT * FROM (${cuotaSql}) x WHERE id_cuota=$1`,
        [id],
      );
      if (amount > cents(cuota.saldo))
        throw new BadRequestException('El abono supera el saldo de la cuota.');
      await this.context(
        m,
        user,
        'Primer abono confirmado: conversión automática a cliente',
      );
      const [row] = await m.query(
        `INSERT INTO pago(id_contrato,id_lead,nro_cuota,id_cuota,monto,moneda,metodo,estado,fecha_pago,
        referencia_operacion,comprobante_url,id_usuario_registro,clave_idempotencia)
        VALUES($1,$2,$3,$4,$5,$6,$7,'confirmado',$8,$9,$10,$11,$12) RETURNING *`,
        [
          cuota.id_contrato,
          cuota.id_lead,
          cuota.nro_cuota,
          id,
          dto.monto,
          cuota.moneda,
          dto.metodo,
          dto.fechaPago,
          dto.referenciaOperacion || null,
          dto.comprobanteUrl || null,
          user,
          dto.claveIdempotencia,
        ],
      );
      return camel(row);
    });
  }
  async resolverPago(id: number, dto: ResolverPagoDto, user: number) {
    return this.db.transaction(async (m) => {
      const [ref] = await m.query(
        'SELECT id_contrato FROM pago WHERE id_pago=$1',
        [id],
      );
      if (!ref) throw new NotFoundException('Pago no encontrado.');
      const contract = await this.contrato(ref.id_contrato, m, true);
      if (contract.id_cronograma)
        throw new ConflictException(
          'Los cobros previos están bloqueados porque el contrato ya tiene cronograma.',
        );
      const [pago] = await m.query(
        'SELECT * FROM pago WHERE id_pago=$1 FOR UPDATE',
        [id],
      );
      if (pago.estado !== 'pendiente' || pago.id_cuota)
        throw new ConflictException(
          'Solo se pueden resolver cobros históricos pendientes.',
        );
      if (dto.estado === 'confirmado') {
        if (
          !dto.fechaPago ||
          !dto.fechaPago.includes('T') ||
          !/(Z|[+-]\d{2}:\d{2})$/.test(dto.fechaPago) ||
          new Date(dto.fechaPago).getTime() > Date.now() + 60_000 ||
          !pago.metodo
        )
          throw new BadRequestException(
            'El pago debe tener método y fecha con zona horaria para confirmarlo.',
          );
        if (
          pago.id_lead !== contract.id_lead ||
          pago.moneda !== contract.moneda ||
          cents(pago.monto) <= 0n ||
          cents(pago.monto) > cents(contract.saldo)
        )
          throw new BadRequestException(
            'El pago es inconsistente con el saldo del contrato.',
          );
      }
      await this.context(m, user, 'Confirmación de cobro previo');
      const [row] = await m.query(
        'UPDATE pago SET estado=$1,fecha_pago=$2,id_usuario_registro=$3 WHERE id_pago=$4 RETURNING *',
        [dto.estado, dto.fechaPago || null, user, id],
      );
      return camel(row);
    });
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
        FROM pago p
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
          FROM pago p JOIN contrato ct ON ct.id_contrato=p.id_contrato
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
      makeRatioKpi('CTR', number(publication.clicks), number(publication.impressions)),
      makeRatioKpi('TIL', number(landing.interactions), number(landing.visits)),
      makeRatioKpi('TCL', number(landing.completed_forms), number(landing.form_visits)),
      makeRatioKpi('LPO', number(leadStats.target_leads), leads),
      makeKpi('TPR', chat.avg_response_seconds === null ? null : number(chat.avg_response_seconds), number(chat.response_count), null),
      makeRatioKpi('TSU', number(chat.positive_ratings), number(chat.ratings)),
      makeRatioKpi('TCP', number(payers.payers), leads),
      makeRatioKpi('TAP', number(proposalStats.accepted), number(proposalStats.sent)),
      makeKpi('TPC', conversion.avg_days === null ? null : number(conversion.avg_days), number(conversion.converted), null),
    ];

    return {
      range,
      assumptions: {
        payer: 'Lead con al menos un pago confirmado en pago.estado = confirmado.',
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
          value: makeRatioKpi('CTR', number(row.clicks), number(row.impressions)).value,
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
        sum(abonado::numeric)::numeric(10,2)::text AS cobrado FROM (${cuotaSql}) x GROUP BY moneda ORDER BY moneda`),
      this.db.query(
        `SELECT * FROM (${cuotaSql}) x WHERE saldo::numeric>0 ORDER BY fecha_vencimiento,id_cuota LIMIT 5`,
      ),
      this.db.query(
        'SELECT l.*,e.nombre AS estado_nombre FROM lead l JOIN estado_lead e USING(id_estado) ORDER BY fecha_registro DESC LIMIT 5',
      ),
    ]);
    return {
      leads: leads[0],
      estados: map(estados),
      monedas: map(monedas),
      proximos: map(proximos),
      recientes: map(recientes),
    };
  }
}
