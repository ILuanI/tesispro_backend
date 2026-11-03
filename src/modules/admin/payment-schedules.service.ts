import { randomUUID } from 'node:crypto';
import { PaymentVerificationService } from './payment-verification.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { CronogramaDto } from './admin.dto.js';
import {
  PaymentModeDto,
  ScheduleActionDto,
  SchedulePreviewDto,
} from './payment-schedules.dto.js';
import { cents, decimal, monthlySchedule } from './money.js';

@Injectable()
export class PaymentSchedulesService {
  constructor(
    private readonly db: DataSource,
    private readonly payments: PaymentVerificationService,
  ) {}
  async modes(publicOnly = false) {
    return this.db.query(
      `SELECT id_modalidad AS "idModalidad",nombre,tipo,activa,cantidad,fases,condiciones,regla_activacion AS "reglaActivacion",revision FROM modalidad_pago ${publicOnly ? 'WHERE activa=true' : ''} ORDER BY id_modalidad`,
    );
  }
  private async event(
    m: EntityManager,
    version: number | null,
    user: number,
    tipo: string,
    detalle: unknown = {},
    mode: number | null = null,
  ) {
    await m.query(
      'INSERT INTO cronograma_evento(id_version,id_modalidad,tipo,detalle,id_usuario) VALUES($1,$2,$3,$4::jsonb,$5)',
      [version, mode, tipo, JSON.stringify(detalle), user],
    );
  }
  async saveMode(id: number, dto: PaymentModeDto, user: number) {
    if (!dto.nombre.trim()) throw new BadRequestException('Indica un nombre.');
    if (dto.tipo === 'unico' && dto.cantidad !== 1)
      throw new BadRequestException('El pago único requiere una cuota.');
    if (
      dto.tipo === 'fases' &&
      (!dto.fases.length ||
        dto.fases.length !== dto.cantidad ||
        dto.fases.reduce((s, f) => s + f.porcentaje, 0) !== 10000 ||
        dto.fases.some(
          (f, i) =>
            !f.nombre.trim() || (i > 0 && f.dias < dto.fases[i - 1].dias),
        ))
    )
      throw new BadRequestException(
        'Las fases deben sumar 10000 puntos básicos (100%) y ordenar sus días.',
      );
    return this.db.transaction(async (m) => {
      const [old] = await m.query(
        'SELECT * FROM modalidad_pago WHERE id_modalidad=$1 FOR UPDATE',
        [id],
      );
      if (!old) throw new NotFoundException('Modalidad no encontrada.');
      if (old.revision !== dto.revision)
        throw new ConflictException('La modalidad cambió. Recarga.');
      await m.query(
        'UPDATE modalidad_pago SET nombre=$2,tipo=$3,activa=$4,cantidad=$5,fases=$6::jsonb,condiciones=$7,regla_activacion=$8,id_usuario=$9,revision=revision+1,actualizado_en=now() WHERE id_modalidad=$1',
        [
          id,
          dto.nombre.trim(),
          dto.tipo,
          dto.activa,
          dto.cantidad,
          JSON.stringify(dto.fases),
          dto.condiciones,
          dto.reglaActivacion ?? null,
          user,
        ],
      );
      await this.event(
        m,
        null,
        user,
        'configurar_modalidad',
        { antes: old, despues: dto },
        id,
      );
      return { ok: true };
    });
  }
  private async contract(m: EntityManager, id: number, lock = false) {
    if (lock)
      await m.query(
        'SELECT id_contrato FROM contrato WHERE id_contrato=$1 FOR UPDATE',
        [id],
      );
    const [c] = await m.query(
      `SELECT ct.*,p.moneda,p.monto_total,p.estado AS estado_propuesta,p.id_lead AS lead_propuesta,r.version_actual AS version_r8,r.estado AS estado_r8,
      coalesce((SELECT sum(monto) FROM pago_neto WHERE id_contrato=ct.id_contrato AND estado='confirmado'),0)::numeric(10,2)::text AS cobrado,
      EXISTS(SELECT 1 FROM pago WHERE id_contrato=ct.id_contrato AND estado='pendiente') AS pendientes,
      EXISTS(SELECT 1 FROM pago WHERE id_contrato=ct.id_contrato AND (moneda<>p.moneda OR id_lead<>ct.id_lead)) AS inconsistente
      FROM contrato ct JOIN propuesta p USING(id_propuesta) LEFT JOIN r8_propuesta r USING(id_propuesta) WHERE ct.id_contrato=$1`,
      [id],
    );
    if (!c) throw new NotFoundException('Contrato no encontrado.');
    if (
      c.estado_propuesta !== 'aceptada' ||
      (c.version_r8 && c.estado_r8 !== 'aceptada') ||
      c.lead_propuesta !== c.id_lead
    )
      throw new BadRequestException(
        'El contrato requiere la propuesta aceptada del mismo lead.',
      );
    if (c.pendientes || c.inconsistente)
      throw new ConflictException(
        'Resuelve los pagos pendientes o inconsistentes antes de programar.',
      );
    return c;
  }
  async sourceDeliverables(id: number) {
    const [c] = await this.db.query(
      `SELECT p.condiciones,v.contenido FROM contrato ct JOIN propuesta p USING(id_propuesta) LEFT JOIN r8_propuesta r USING(id_propuesta) LEFT JOIN r8_propuesta_version v ON v.id_propuesta=p.id_propuesta AND v.version=r.version_actual WHERE ct.id_contrato=$1`,
      [id],
    );
    if (!c) throw new NotFoundException('Contrato no encontrado.');
    const texts: string[] = [];
    const walk = (value: any, key = '') => {
      if (key === 'entregables' && Array.isArray(value))
        for (const item of value)
          if (typeof item === 'string') texts.push(item);
      if (value && typeof value === 'object')
        for (const [k, v] of Object.entries(value)) walk(v, k);
    };
    walk(c.contenido);
    for (const line of String(c.condiciones || '').split('\n'))
      if (line.startsWith('Entregable: ')) texts.push(line.slice(12));
    return [...new Set(texts.map((t) => t.trim()).filter(Boolean))];
  }
  async preview(id: number, dto: SchedulePreviewDto) {
    const c = await this.contract(this.db.manager, id);
    c.cobrado = await this.payments.projectedPaid(
      this.db.manager,
      id,
      c.cobrado,
      dto.idRectificacion,
    );
    const total = cents(c.monto_total) - cents(c.cobrado);
    if (total <= 0n) throw new BadRequestException('No hay saldo pendiente.');
    const mode = dto.idModalidad
      ? (await this.modes()).find((x: any) => x.idModalidad === dto.idModalidad)
      : null;
    if (dto.idModalidad && !mode?.activa)
      throw new BadRequestException('Modalidad no disponible.');
    const rows = monthlySchedule(
      decimal(total),
      mode?.tipo === 'unico' ? 1 : (mode?.cantidad ?? dto.cantidad),
      dto.primerVencimiento,
    );
    if (mode?.tipo === 'fases') {
      let allocated = 0n;
      mode.fases.forEach((f: any, i: number) => {
        const n =
          i === rows.length - 1
            ? total - allocated
            : (total * BigInt(f.porcentaje)) / 10000n;
        if (n <= 0n)
          throw new BadRequestException('El saldo no alcanza para las fases.');
        allocated += n;
        const date = new Date(dto.primerVencimiento + 'T12:00:00Z');
        date.setUTCDate(date.getUTCDate() + f.dias);
        rows[i] = {
          nroCuota: i + 1,
          monto: decimal(n),
          fechaVencimiento: date.toISOString().slice(0, 10),
        };
      });
    }
    return {
      cuotas: rows.map((r, i) => ({
        ...r,
        entregables:
          mode?.tipo === 'fases'
            ? [{ texto: mode.fases[i].nombre, origen: 'adicional' }]
            : [],
      })),
      saldo: decimal(total),
    };
  }
  async save(id: number, dto: CronogramaDto, user: number) {
    const source = await this.sourceDeliverables(id);
    return this.db.transaction(async (m) => {
      const c = await this.contract(m, id, true);
      c.cobrado = await this.payments.projectedPaid(
        m,
        id,
        c.cobrado,
        dto.idRectificacion,
      );
      let [root] = await m.query(
        'SELECT * FROM cronograma_pago WHERE id_contrato=$1 FOR UPDATE',
        [id],
      );
      if ((root?.revision ?? 0) !== dto.revision)
        throw new ConflictException(
          'El cronograma cambió. Recarga antes de guardar.',
        );
      const total = cents(c.monto_total),
        paid = cents(c.cobrado),
        remaining = total - paid;
      if (remaining <= 0n)
        throw new BadRequestException('No hay saldo pendiente.');
      const mode = (await this.modes()).find(
        (x: any) => x.idModalidad === dto.idModalidad,
      );
      if (!mode?.activa)
        throw new BadRequestException('Elige una modalidad habilitada.');
      if (
        (root?.id_version_actual || mode.tipo === 'personalizado') &&
        !dto.motivo?.trim()
      )
        throw new BadRequestException(
          'Indica el motivo del cronograma personalizado o de la renegociación.',
        );
      const rows = [...dto.cuotas].sort((a, b) => a.nroCuota - b.nroCuota);
      let sum = 0n;
      rows.forEach((r, i) => {
        if (
          r.nroCuota !== i + 1 ||
          cents(r.monto) <= 0n ||
          (i > 0 && r.fechaVencimiento < rows[i - 1].fechaVencimiento)
        )
          throw new BadRequestException(
            'Cuotas consecutivas, positivas y fechas ordenadas requeridas.',
          );
        sum += cents(r.monto);
        for (const d of r.entregables ?? [])
          if (
            !d.texto.trim() ||
            (d.origen === 'propuesta' && !source.includes(d.texto))
          )
            throw new BadRequestException(
              'El entregable no pertenece a la propuesta aceptada.',
            );
      });
      if (sum !== remaining)
        throw new BadRequestException(
          'La suma de cuotas debe coincidir con el saldo pendiente.',
        );
      if (mode.tipo === 'unico' && rows.length !== 1)
        throw new BadRequestException('El pago único requiere una cuota.');
      let adjusted = mode.tipo === 'personalizado';
      if (mode.tipo === 'mensual') {
        const expected = monthlySchedule(
          decimal(remaining),
          mode.cantidad,
          rows[0].fechaVencimiento,
        );
        adjusted =
          expected.length !== rows.length ||
          expected.some(
            (r, i) =>
              !rows[i] ||
              cents(r.monto) !== cents(rows[i].monto) ||
              r.fechaVencimiento !== rows[i].fechaVencimiento,
          );
      }
      if (mode.tipo === 'fases') {
        const base = new Date(rows[0].fechaVencimiento + 'T12:00:00Z');
        base.setUTCDate(base.getUTCDate() - mode.fases[0].dias);
        let allocated = 0n;
        adjusted =
          mode.fases.length !== rows.length ||
          mode.fases.some((f: any, i: number) => {
            const amount =
              i === mode.fases.length - 1
                ? remaining - allocated
                : (remaining * BigInt(f.porcentaje)) / 10000n;
            allocated += amount;
            const date = new Date(base);
            date.setUTCDate(date.getUTCDate() + f.dias);
            return (
              !rows[i] ||
              cents(rows[i].monto) !== amount ||
              rows[i].fechaVencimiento !== date.toISOString().slice(0, 10)
            );
          });
      }
      if (adjusted && !dto.motivo?.trim())
        throw new BadRequestException(
          'Motiva los ajustes a la distribución autorizada.',
        );
      // Each snapshot is approved explicitly, including changes to a generated template.
      const conditions = dto.condiciones ?? mode.condiciones;
      if (conditions !== mode.condiciones && !dto.motivo?.trim())
        throw new BadRequestException('Motiva las condiciones especiales.');
      if (!root)
        [root] = await m.query(
          'INSERT INTO cronograma_pago(id_contrato,monto_programado,cobros_previos,moneda,id_usuario) VALUES($1,$2,$3,$4,$5) RETURNING *',
          [id, decimal(remaining), c.cobrado, c.moneda, user],
        );
      await m.query(
        "UPDATE cronograma_version SET estado='sustituido' WHERE id_cronograma=$1 AND estado IN ('borrador','pendiente_aprobacion')",
        [root.id_cronograma],
      );
      const [{ numero }] = await m.query(
        'SELECT coalesce(max(numero),0)+1 AS numero FROM cronograma_version WHERE id_cronograma=$1',
        [root.id_cronograma],
      );
      const [v] = await m.query(
        `INSERT INTO cronograma_version(id_cronograma,numero,id_propuesta,version_r8,moneda,total_acordado,cobros_reconocidos,monto_programado,modalidad,condiciones,motivo,id_autor,id_rectificacion)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13) RETURNING *`,
        [
          root.id_cronograma,
          numero,
          c.id_propuesta,
          c.version_r8 ?? null,
          c.moneda,
          c.monto_total,
          c.cobrado,
          decimal(remaining),
          JSON.stringify({ ...mode, excepcion: adjusted }),
          conditions,
          dto.motivo?.trim() || '',
          user,
          dto.idRectificacion ?? null,
        ],
      );
      for (const r of rows)
        await m.query(
          'INSERT INTO cuota_pago(id_cronograma,id_version,nro_cuota,monto,fecha_vencimiento,entregables) VALUES($1,$2,$3,$4,$5,$6::jsonb)',
          [
            root.id_cronograma,
            v.id_version,
            r.nroCuota,
            r.monto,
            r.fechaVencimiento,
            JSON.stringify(r.entregables ?? []),
          ],
        );
      await m.query(
        'UPDATE cronograma_pago SET revision=revision+1 WHERE id_cronograma=$1',
        [root.id_cronograma],
      );
      await this.event(m, v.id_version, user, 'borrador', {
        motivo: dto.motivo || '',
        versionAnterior: root.id_version_actual,
      });
      return {
        idCronograma: root.id_cronograma,
        idVersion: v.id_version,
        revision: root.revision + 1,
      };
    });
  }
  async detail(id: number) {
    const [root] = await this.db.query(
      'SELECT * FROM cronograma_pago WHERE id_contrato=$1',
      [id],
    );
    if (!root)
      return {
        revision: 0,
        versionActual: null,
        versiones: [],
        eventos: [],
        entregablesPropuesta: await this.sourceDeliverables(id),
      };
    const versions = await this.db.query(
      'SELECT v.*,u.nombres AS autor FROM cronograma_version v JOIN usuario_interno u ON u.id_usuario=v.id_autor WHERE id_cronograma=$1 ORDER BY numero DESC',
      [root.id_cronograma],
    );
    for (const v of versions)
      v.cuotas = await this.db.query(
        `SELECT c.*,c.fecha_vencimiento::text AS fecha_vencimiento,coalesce(a.pagado,0)::numeric(10,2)::text AS abonado,(c.monto-coalesce(a.pagado,0))::numeric(10,2)::text AS saldo,
      coalesce((SELECT jsonb_agg(jsonb_build_object('indice',e.indice,'estado',e.estado,'fecha',e.fecha,'idUsuario',e.id_usuario)) FROM cuota_entrega e WHERE e.id_cuota=c.id_cuota),'[]') AS avances,
      coalesce((SELECT jsonb_agg(jsonb_build_object('idPago',p.id_pago,'monto',p.monto::text,'fechaPago',p.fecha_pago,'estado',p.estado,'metodo',p.metodo,'referencia',p.referencia_operacion) ORDER BY p.id_pago) FROM pago p WHERE p.id_cuota=c.id_cuota),'[]') AS pagos
      FROM cuota_pago c LEFT JOIN (SELECT id_cuota,sum(monto) AS pagado FROM pago_neto WHERE estado='confirmado' GROUP BY id_cuota) a USING(id_cuota) WHERE c.id_version=$1 ORDER BY nro_cuota`,
        [v.id_version],
      );
    const events = await this.db.query(
      'SELECT e.*,u.nombres AS autor FROM cronograma_evento e JOIN cronograma_version v USING(id_version) JOIN usuario_interno u ON u.id_usuario=e.id_usuario WHERE v.id_cronograma=$1 ORDER BY id_evento DESC',
      [root.id_cronograma],
    );
    return {
      rectificacionesPendientes: (await this.payments.rectifications()).filter(
        (r: any) => r.idContrato === id && r.estado === 'pendiente',
      ),
      revision: root.revision,
      versionActual: root.id_version_actual,
      versiones: versions,
      eventos: events,
      entregablesPropuesta: await this.sourceDeliverables(id),
    };
  }
  async action(
    id: number,
    version: number,
    dto: ScheduleActionDto,
    user: number,
  ) {
    await this.db.transaction(async (m) => {
      const c = await this.contract(m, id, true);
      const [root] = await m.query(
        'SELECT * FROM cronograma_pago WHERE id_contrato=$1 FOR UPDATE',
        [id],
      );
      if (!root || root.revision !== dto.revision)
        throw new ConflictException('El cronograma cambió. Recarga.');
      const [v] = await m.query(
        'SELECT * FROM cronograma_version WHERE id_cronograma=$1 AND id_version=$2 FOR UPDATE',
        [root.id_cronograma, version],
      );
      if (!v) throw new NotFoundException('Versión no encontrada.');
      c.cobrado = await this.payments.projectedPaid(
        m,
        id,
        c.cobrado,
        v.id_rectificacion ?? undefined,
      );
      if (dto.accion === 'solicitar') {
        if (v.estado !== 'borrador')
          throw new ConflictException(
            'Solo se puede solicitar la aprobación de un borrador.',
          );
        await m.query(
          "UPDATE cronograma_version SET estado='pendiente_aprobacion' WHERE id_version=$1",
          [version],
        );
      } else {
        if (v.estado !== 'pendiente_aprobacion')
          throw new ConflictException('Solicita aprobación antes de aprobar.');
        if (
          cents(c.cobrado) !== cents(v.cobros_reconocidos) ||
          cents(c.monto_total) !== cents(v.total_acordado) ||
          c.moneda !== v.moneda ||
          (c.version_r8 ?? null) !== v.version_r8
        )
          throw new ConflictException(
            'Los pagos o el acuerdo cambiaron. Prepara una nueva versión.',
          );
        if (
          root.id_version_actual ||
          v.modalidad.excepcion ||
          v.modalidad.tipo === 'personalizado' ||
          v.condiciones !== v.modalidad.condiciones
        )
          if (!dto.motivo?.trim())
            throw new BadRequestException(
              'La aprobación excepcional requiere un motivo explícito.',
            );
        if (v.id_rectificacion)
          await this.payments.applyRectification(
            m,
            v.id_rectificacion,
            {
              estado: 'confirmado',
              motivo: dto.motivo || v.motivo,
              claveIdempotencia: randomUUID(),
            },
            user,
            v.id_version,
          );
        await m.query(
          "UPDATE cronograma_version SET estado='sustituido' WHERE id_version=$1",
          [root.id_version_actual],
        );
        await m.query(
          "UPDATE cronograma_version SET estado='negociado' WHERE id_version=$1",
          [version],
        );
        await m.query(
          'UPDATE cronograma_pago SET id_version_actual=$2,monto_programado=$3,cobros_previos=$4 WHERE id_cronograma=$1',
          [
            root.id_cronograma,
            version,
            v.monto_programado,
            v.cobros_reconocidos,
          ],
        );
        await m.query('SELECT cronograma_actualizar_estado($1,$2)', [id, user]);
      }
      // Content version numbers and optimistic revisions are independent.
      await m.query(
        'UPDATE cronograma_pago SET revision=revision+1 WHERE id_cronograma=$1',
        [root.id_cronograma],
      );
      await this.event(m, version, user, dto.accion, {
        motivo: dto.motivo || '',
      });
    });
    return this.detail(id);
  }
  async delivery(id: number, index: number, state: string, user: number) {
    return this.db.transaction(async (m) => {
      const [ref] = await m.query(
        'SELECT cp.id_contrato FROM cuota_pago c JOIN cronograma_pago cp USING(id_cronograma) WHERE c.id_cuota=$1',
        [id],
      );
      if (!ref) throw new NotFoundException('Cuota no encontrada.');
      await m.query(
        'SELECT id_contrato FROM contrato WHERE id_contrato=$1 FOR UPDATE',
        [ref.id_contrato],
      );
      const [c] = await m.query(
        'SELECT c.*,cp.id_version_actual FROM cuota_pago c JOIN cronograma_pago cp USING(id_cronograma) WHERE id_cuota=$1',
        [id],
      );
      if (c.id_version !== c.id_version_actual || !c.entregables[index])
        throw new ConflictException(
          'Solo se actualizan entregables de la versión vigente.',
        );
      const [previous] = await m.query(
        'SELECT * FROM cuota_entrega WHERE id_cuota=$1 AND indice=$2',
        [id, index],
      );
      await m.query(
        'INSERT INTO cuota_entrega(id_cuota,indice,estado,id_usuario) VALUES($1,$2,$3,$4) ON CONFLICT(id_cuota,indice) DO UPDATE SET estado=excluded.estado,id_usuario=excluded.id_usuario,fecha=now()',
        [id, index, state, user],
      );
      await this.event(m, c.id_version, user, 'entregable', {
        idCuota: id,
        indice: index,
        antes: previous?.estado ?? 'pendiente',
        despues: state,
      });
      return { ok: true };
    });
  }
}
