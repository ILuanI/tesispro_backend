import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { AbonoDto } from './admin.dto.js';
import { MetodoPago } from '../../common/enums/database.enums.js';
import { cents, decimal } from './money.js';
import {
  PaymentDecisionDto,
  PaymentListDto,
  RectificationDto,
} from './payment-verification.dto.js';
export interface PaymentUpload {
  originalname: string;
  buffer: Buffer;
  size: number;
}
export const camelPayment = (row: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      v,
    ]),
  );
export function paymentUpload(file: PaymentUpload) {
  const ext = file.originalname.split('.').pop()?.toLowerCase(),
    b = file.buffer;
  const mime =
    ext === 'pdf' && b.subarray(0, 5).toString() === '%PDF-'
      ? 'application/pdf'
      : ext === 'png' &&
          b.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        ? 'image/png'
        : ['jpg', 'jpeg'].includes(ext || '') &&
            b.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
          ? 'image/jpeg'
          : '';
  if (!mime || !b.length || b.length > 10485760 || b.length !== file.size)
    throw new BadRequestException(
      'Adjunta PDF, PNG o JPEG válido de hasta 10 MB.',
    );
  return {
    mime,
    nombre: file.originalname.replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(-255),
    huella: createHash('sha256').update(b).digest('hex'),
  };
}
const paymentsSql = `SELECT p.*,u.nombres AS registrador,v.nombres AS verificador,
  coalesce((SELECT sum(monto) FROM pago_neto WHERE id_pago=p.id_pago AND estado='confirmado'),0)::numeric(10,2)::text AS aplicado,
  (NOT EXISTS(SELECT 1 FROM pago_comprobante WHERE id_pago=p.id_pago) AND coalesce(p.comprobante_url,'')='') AS evidencia_incompleta,
  EXISTS(SELECT 1 FROM pago p2 WHERE p2.id_pago<>p.id_pago AND p2.estado<>'rechazado' AND nullif(trim(p.referencia_operacion),'') IS NOT NULL AND lower(trim(p2.referencia_operacion))=lower(trim(p.referencia_operacion)) AND p2.metodo=p.metodo AND p2.moneda=p.moneda AND p2.monto=p.monto AND (p2.fecha_pago AT TIME ZONE 'America/Lima')::date=(p.fecha_pago AT TIME ZONE 'America/Lima')::date) AS posible_duplicado,
  (p.estado='pendiente' AND p.monto>coalesce(q.monto-(SELECT coalesce(sum(n.monto),0) FROM pago_neto n WHERE n.id_cuota=p.id_cuota AND n.estado='confirmado'),pr.monto_total-(SELECT coalesce(sum(n.monto),0) FROM pago_neto n WHERE n.id_contrato=p.id_contrato AND n.estado='confirmado'))) AS excedente,
  c.id_lead AS titular, l.nombres,l.apellidos,l.correo,l.telefono
  FROM pago p JOIN contrato c ON c.id_contrato=p.id_contrato JOIN propuesta pr ON pr.id_propuesta=c.id_propuesta JOIN lead l ON l.id_lead=c.id_lead
  LEFT JOIN cuota_pago q ON q.id_cuota=p.id_cuota LEFT JOIN usuario_interno u ON u.id_usuario=p.id_usuario_registro LEFT JOIN usuario_interno v ON v.id_usuario=p.id_verificador`;

@Injectable()
export class PaymentVerificationService {
  constructor(private readonly db: DataSource) {}
  private async role(m: EntityManager, user: number, role: string) {
    const [u] = await m.query(
      'SELECT rol FROM usuario_interno WHERE id_usuario=$1 AND activo=true',
      [user],
    );
    if (u?.rol !== 'administrador' && u?.rol !== role)
      throw new ForbiddenException(
        role === 'asesor_comercial'
          ? 'El asesor comercial registra el movimiento.'
          : 'El administrador verifica el movimiento.',
      );
  }
  async event(
    m: EntityManager,
    id: number,
    user: number,
    type: string,
    detail: unknown = {},
  ) {
    await m.query(
      'INSERT INTO pago_evento(id_pago,id_usuario,tipo,detalle) VALUES($1,$2,$3,$4::jsonb)',
      [id, user, type, JSON.stringify(detail)],
    );
  }
  async catalog() {
    return { metodos: Object.values(MetodoPago) };
  }
  async holders() {
    return this.db.query(
      'SELECT DISTINCT l.id_lead AS "idLead",l.nombres,l.apellidos,l.correo,l.telefono FROM contrato c JOIN lead l USING(id_lead) ORDER BY l.nombres,l.id_lead',
    );
  }
  async contracts(lead: string) {
    return this.db.query(
      `SELECT c.id_contrato AS "idContrato",p.moneda,p.monto_total AS "montoTotal" FROM contrato c JOIN propuesta p USING(id_propuesta) WHERE c.id_lead=$1 ORDER BY c.id_contrato DESC`,
      [lead],
    );
  }
  async installments(id: number) {
    return this.db.query(
      `SELECT q.id_cuota AS "idCuota",q.nro_cuota AS "nroCuota",q.monto,q.fecha_vencimiento::text AS "fechaVencimiento",v.moneda,v.estado AS "estadoCronograma",(q.monto-(SELECT coalesce(sum(monto),0) FROM pago_neto WHERE id_cuota=q.id_cuota AND estado='confirmado'))::numeric(10,2)::text AS saldo FROM cuota_pago q JOIN cronograma_pago cp ON cp.id_cronograma=q.id_cronograma AND cp.id_version_actual=q.id_version JOIN cronograma_version v ON v.id_version=q.id_version WHERE cp.id_contrato=$1 ORDER BY q.nro_cuota`,
      [id],
    );
  }
  async list(dto: PaymentListDto) {
    const params: any[] = [];
    const filters: string[] = [];
    if (dto.estado) {
      params.push(dto.estado);
      filters.push(`estado=$${params.length}`);
    }
    if (dto.contrato) {
      params.push(dto.contrato);
      filters.push(`id_contrato=$${params.length}`);
    }
    if (dto.q) {
      params.push('%' + dto.q + '%');
      filters.push(
        `concat_ws(' ',nombres,apellidos,correo,telefono,referencia_operacion,id_pago::text,id_contrato::text) ILIKE $${params.length}`,
      );
    }
    if (dto.incidencias === 'true')
      filters.push('(evidencia_incompleta OR posible_duplicado OR excedente)');
    const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
    const [{ total }] = await this.db.query(
      `SELECT count(*)::int AS total FROM (${paymentsSql}) x${where}`,
      params,
    );
    const items = await this.db.query(
      `SELECT * FROM (${paymentsSql}) x${where} ORDER BY id_pago DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, dto.pageSize, (dto.page - 1) * dto.pageSize],
    );
    return {
      items: items.map(camelPayment),
      total,
      page: dto.page,
      pageSize: dto.pageSize,
    };
  }
  async detail(id: number): Promise<any> {
    const [p] = await this.db.query(
      `SELECT * FROM (${paymentsSql}) x WHERE id_pago=$1`,
      [id],
    );
    if (!p) throw new NotFoundException('Pago no encontrado.');
    return {
      ...camelPayment(p),
      comprobantes: (
        await this.db.query(
          'SELECT id_comprobante,nombre,mime,huella,fecha,id_usuario FROM pago_comprobante WHERE id_pago=$1 ORDER BY id_comprobante',
          [id],
        )
      ).map(camelPayment),
      eventos: (
        await this.db.query(
          'SELECT e.*,u.nombres AS autor FROM pago_evento e LEFT JOIN usuario_interno u USING(id_usuario) WHERE id_pago=$1 ORDER BY id_evento',
          [id],
        )
      ).map(camelPayment),
      rectificaciones: (
        await this.db.query(
          'SELECT * FROM pago_rectificacion WHERE id_pago=$1 ORDER BY id_rectificacion DESC',
          [id],
        )
      ).map(camelPayment),
    };
  }
  private async appendFile(
    m: EntityManager,
    id: number,
    user: number,
    file: PaymentUpload,
  ) {
    const f = paymentUpload(file);
    const [saved] = await m.query(
      'INSERT INTO pago_comprobante(id_pago,nombre,mime,contenido,huella,id_usuario) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id_pago,huella) DO NOTHING RETURNING id_comprobante',
      [id, f.nombre, f.mime, file.buffer, f.huella, user],
    );
    if (saved)
      await this.event(m, id, user, 'comprobante', {
        idComprobante: saved.id_comprobante,
        huella: f.huella,
      });
  }
  async register(
    id: number,
    dto: AbonoDto,
    user: number,
    file?: PaymentUpload,
  ) {
    const amount = cents(dto.monto);
    if (
      amount <= 0n ||
      !dto.fechaPago.includes('T') ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(dto.fechaPago) ||
      new Date(dto.fechaPago).getTime() > Date.now() + 60000
    )
      throw new BadRequestException(
        'Importe positivo y fecha con zona horaria no futura requeridos.',
      );
    if (dto.comprobanteUrl)
      throw new BadRequestException(
        'Sube el comprobante privado; los enlaces se conservan solo para registros históricos.',
      );
    const f = file ? paymentUpload(file) : null;
    const result = await this.db.transaction(async (m) => {
      await this.role(m, user, 'asesor_comercial');
      const [ref] = await m.query(
        'SELECT cp.id_contrato FROM cuota_pago q JOIN cronograma_pago cp USING(id_cronograma) WHERE q.id_cuota=$1',
        [id],
      );
      if (!ref) throw new NotFoundException('Cuota no encontrada.');
      await m.query(
        'SELECT id_contrato FROM contrato WHERE id_contrato=$1 FOR UPDATE',
        [ref.id_contrato],
      );
      const [old] = await m.query(
        'SELECT * FROM pago WHERE clave_idempotencia=$1',
        [dto.claveIdempotencia],
      );
      if (old) {
        const [evidence] = await m.query(
          "SELECT detalle->>'huella' AS huella FROM pago_evento WHERE id_pago=$1 AND tipo='registro_evidencia' ORDER BY id_evento LIMIT 1",
          [old.id_pago],
        );
        if (
          old.id_cuota !== id ||
          old.id_usuario_registro !== user ||
          cents(old.monto) !== amount ||
          old.metodo !== dto.metodo ||
          new Date(old.fecha_pago).getTime() !==
            new Date(dto.fechaPago).getTime() ||
          (old.referencia_operacion || '') !==
            (dto.referenciaOperacion || '') ||
          (old.id_pago_origen ?? null) !== (dto.idPagoOrigen ?? null) ||
          (evidence?.huella ?? null) !== (f?.huella ?? null)
        )
          throw new ConflictException(
            'La clave de registro ya se utilizó con otros datos.',
          );
        return old.id_pago;
      }
      const [q] = await m.query(
        `SELECT q.*,cp.id_contrato,v.estado,ct.id_lead,v.moneda FROM cuota_pago q JOIN cronograma_pago cp ON cp.id_cronograma=q.id_cronograma AND cp.id_version_actual=q.id_version JOIN cronograma_version v ON v.id_version=q.id_version JOIN contrato ct ON ct.id_contrato=cp.id_contrato WHERE id_cuota=$1`,
        [id],
      );
      if (!q || !['negociado', 'en_ejecucion'].includes(q.estado))
        throw new ConflictException(
          'Selecciona una cuota de un cronograma aprobado y vigente.',
        );
      if (dto.idPagoOrigen) {
        const [source] = await m.query(
          "SELECT p.* FROM pago p WHERE id_pago=$1 AND id_contrato=$2 AND (estado='rechazado' OR EXISTS(SELECT 1 FROM pago_rectificacion r WHERE r.id_pago=p.id_pago AND r.estado='confirmado'))",
          [dto.idPagoOrigen, q.id_contrato],
        );
        if (!source)
          throw new BadRequestException(
            'El reemplazo requiere un pago rechazado o rectificado del mismo contrato.',
          );
      }
      const [p] = await m.query(
        `INSERT INTO pago(id_contrato,id_lead,id_cuota,nro_cuota,monto,moneda,metodo,estado,fecha_pago,referencia_operacion,id_usuario_registro,clave_idempotencia,id_pago_origen) VALUES($1,$2,$3,$4,$5,$6,$7,'pendiente',$8,$9,$10,$11,$12) RETURNING id_pago`,
        [
          q.id_contrato,
          q.id_lead,
          id,
          q.nro_cuota,
          decimal(amount),
          q.moneda,
          dto.metodo,
          dto.fechaPago,
          dto.referenciaOperacion || null,
          user,
          dto.claveIdempotencia,
          dto.idPagoOrigen ?? null,
        ],
      );
      await this.event(m, p.id_pago, user, 'registro_evidencia', {
        huella: f?.huella ?? null,
      });
      if (file) await this.appendFile(m, p.id_pago, user, file);
      return p.id_pago;
    });
    const d = await this.detail(result);
    return {
      ...d,
      incidencias: [
        ...(d.excedente ? ['excedente'] : []),
        ...(d.posibleDuplicado ? ['posible_duplicado'] : []),
        ...(d.evidenciaIncompleta ? ['evidencia_incompleta'] : []),
      ],
    };
  }
  async addEvidence(id: number, file: PaymentUpload, user: number) {
    if (!file) throw new BadRequestException('Adjunta un archivo.');
    await this.db.transaction(async (m) => {
      await this.role(m, user, 'asesor_comercial');
      const [p] = await m.query('SELECT id_pago FROM pago WHERE id_pago=$1', [
        id,
      ]);
      if (!p) throw new NotFoundException();
      await this.appendFile(m, id, user, file);
    });
    return this.detail(id);
  }
  async download(id: number) {
    const [f] = await this.db.query(
      'SELECT * FROM pago_comprobante WHERE id_comprobante=$1',
      [id],
    );
    if (!f) throw new NotFoundException('Comprobante no encontrado.');
    return new StreamableFile(f.contenido, {
      type: f.mime,
      length: f.contenido.length,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(f.nombre).replace(/'/g, '%27')}`,
    });
  }
  async regularize(id: number, dto: RectificationDto, user: number) {
    await this.db.transaction(async (m) => {
      await this.role(m, user, 'asesor_comercial');
      const [p] = await m.query(
        "SELECT * FROM pago WHERE id_pago=$1 AND estado='pendiente' AND id_usuario_registro IS NULL FOR UPDATE",
        [id],
      );
      if (!p)
        throw new ConflictException(
          'Solo se regularizan pendientes históricos sin registrador.',
        );
      const [previous] = await m.query(
        "SELECT * FROM pago_evento WHERE id_pago=$1 AND tipo='regularizacion' ORDER BY id_evento LIMIT 1",
        [id],
      );
      if (previous) {
        if (
          previous.id_usuario === user &&
          previous.detalle.clave === dto.claveIdempotencia &&
          previous.detalle.motivo === dto.motivo
        )
          return;
        throw new ConflictException(
          'El registro histórico ya fue regularizado.',
        );
      }
      await this.event(m, id, user, 'regularizacion', {
        motivo: dto.motivo,
        clave: dto.claveIdempotencia,
      });
    });
    return this.detail(id);
  }
  async decide(id: number, dto: PaymentDecisionDto, user: number) {
    if (!dto.motivo.trim())
      throw new BadRequestException('Fundamenta la decisión.');
    const result = await this.db.transaction(async (m) => {
      await this.role(m, user, 'administrador');
      const [ref] = await m.query(
        'SELECT id_contrato FROM pago WHERE id_pago=$1',
        [id],
      );
      if (!ref) throw new NotFoundException('Pago no encontrado.');
      await m.query(
        'SELECT id_contrato FROM contrato WHERE id_contrato=$1 FOR UPDATE',
        [ref.id_contrato],
      );
      const [p] = await m.query(
        'SELECT * FROM pago WHERE id_pago=$1 FOR UPDATE',
        [id],
      );
      const [reg] = await m.query(
        "SELECT id_usuario FROM pago_evento WHERE id_pago=$1 AND tipo='regularizacion' ORDER BY id_evento DESC LIMIT 1",
        [id],
      );
      if (p.estado !== 'pendiente') {
        if (
          p.clave_decision === dto.claveIdempotencia &&
          p.estado === dto.estado &&
          p.motivo_decision === dto.motivo.trim() &&
          p.id_verificador === user
        )
          return {};
        throw new ConflictException('El pago ya tiene una decisión.');
      }
      if (!p.id_usuario_registro && !reg)
        throw new ConflictException(
          'Un asesor debe regularizar este cobro histórico.',
        );
      if (dto.estado === 'confirmado') {
        if (
          !p.metodo ||
          !p.fecha_pago ||
          new Date(p.fecha_pago).getTime() > Date.now() + 60000 ||
          cents(p.monto) <= 0n
        )
          throw new ConflictException(
            'El histórico tiene datos incompletos. Recházalo y registra un reemplazo completo sin editar el original.',
          );
        if (!p.id_cuota) {
          const [root] = await m.query(
            'SELECT id_cronograma FROM cronograma_pago WHERE id_contrato=$1',
            [p.id_contrato],
          );
          if (root)
            throw new ConflictException(
              'El contrato ya tiene cronograma. Rechaza el pendiente histórico y registra su reemplazo en una cuota.',
            );
        }
        const [live] = await m.query(
          `SELECT * FROM (${paymentsSql}) x WHERE id_pago=$1`,
          [id],
        );
        if (live.excedente) {
          await this.event(m, id, user, 'incidencia', {
            tipo: 'excedente',
            motivo: dto.motivo,
          });
          return {
            conflicto:
              'El abono excede el saldo. Sigue pendiente hasta resolver la incidencia.',
          };
        }
        // A matching reference requires an explicit explanation of distinct operations.
        if (
          live.posible_duplicado &&
          !/operaciones distintas:/i.test(dto.motivo)
        ) {
          await this.event(m, id, user, 'incidencia', {
            tipo: 'posible_duplicado',
          });
          return {
            conflicto:
              'Posible duplicado. Recházalo o documenta «Operaciones distintas:» con la evidencia de conciliación.',
          };
        }
      }
      await m.query(
        "SELECT set_config('app.admin_usuario',$1,true),set_config('app.admin_motivo',$2,true)",
        [String(user), 'Verificación independiente de pago'],
      );
      await m.query(
        'UPDATE pago SET estado=$2,id_verificador=$3,verificado_en=now(),motivo_decision=$4,clave_decision=$5 WHERE id_pago=$1',
        [id, dto.estado, user, dto.motivo.trim(), dto.claveIdempotencia],
      );
      return {};
    });
    if (result.conflicto) throw new ConflictException(result.conflicto);
    return this.detail(id);
  }
  async rectifications() {
    return (
      await this.db.query(
        `SELECT r.*,p.monto,p.moneda,p.id_contrato,p.id_cuota,u.nombres AS solicitante,v.nombres AS verificador FROM pago_rectificacion r JOIN pago p USING(id_pago) JOIN usuario_interno u ON u.id_usuario=r.id_solicitante LEFT JOIN usuario_interno v ON v.id_usuario=r.id_verificador ORDER BY r.id_rectificacion DESC LIMIT 100`,
      )
    ).map(camelPayment);
  }
  async requestRectification(id: number, dto: RectificationDto, user: number) {
    return this.db.transaction(async (m) => {
      await this.role(m, user, 'asesor_comercial');
      const [p] = await m.query('SELECT * FROM pago WHERE id_pago=$1', [id]);
      if (!p) throw new NotFoundException();
      await m.query(
        'SELECT id_contrato FROM contrato WHERE id_contrato=$1 FOR UPDATE',
        [p.id_contrato],
      );
      const [old] = await m.query(
        'SELECT * FROM pago_rectificacion WHERE clave_idempotencia=$1',
        [dto.claveIdempotencia],
      );
      if (old) {
        if (
          old.id_pago !== id ||
          old.id_solicitante !== user ||
          old.motivo !== dto.motivo.trim()
        )
          throw new ConflictException('Clave reutilizada.');
        return camelPayment(old);
      }
      const [r] = await m.query(
        'INSERT INTO pago_rectificacion(id_pago,motivo,id_solicitante,clave_idempotencia) VALUES($1,$2,$3,$4) RETURNING *',
        [id, dto.motivo.trim(), user, dto.claveIdempotencia],
      );
      await this.event(m, id, user, 'rectificacion_solicitada', {
        idRectificacion: r.id_rectificacion,
        motivo: r.motivo,
      });
      return camelPayment(r);
    });
  }
  async projectedPaid(
    m: EntityManager,
    contract: number,
    paid: string,
    rect?: number,
  ) {
    if (!rect) return paid;
    const [r] = await m.query(
      "SELECT r.*,p.monto FROM pago_rectificacion r JOIN pago p USING(id_pago) WHERE id_rectificacion=$1 AND p.id_contrato=$2 AND r.estado='pendiente'",
      [rect, contract],
    );
    if (!r)
      throw new ConflictException(
        'Rectificación pendiente no disponible para este contrato.',
      );
    if (cents(r.monto) > cents(paid))
      throw new ConflictException('Importes de rectificación inconsistentes.');
    return decimal(cents(paid) - cents(r.monto));
  }
  async applyRectification(
    m: EntityManager,
    id: number,
    dto: PaymentDecisionDto,
    user: number,
    version?: number,
  ) {
    await this.role(m, user, 'administrador');
    const [ref] = await m.query(
      'SELECT p.id_contrato FROM pago_rectificacion r JOIN pago p USING(id_pago) WHERE id_rectificacion=$1',
      [id],
    );
    if (!ref) throw new NotFoundException('Rectificación no encontrada.');
    await m.query(
      'SELECT id_contrato FROM contrato WHERE id_contrato=$1 FOR UPDATE',
      [ref.id_contrato],
    );
    const [r] = await m.query(
      'SELECT r.*,p.id_contrato,p.id_cuota,p.id_usuario_registro,q.id_version,cp.id_version_actual FROM pago_rectificacion r JOIN pago p USING(id_pago) LEFT JOIN cuota_pago q ON q.id_cuota=p.id_cuota LEFT JOIN cronograma_pago cp ON cp.id_contrato=p.id_contrato WHERE id_rectificacion=$1 FOR UPDATE OF r',
      [id],
    );
    if (r.estado !== 'pendiente') {
      if (
        r.estado === dto.estado &&
        r.clave_decision === dto.claveIdempotencia &&
        r.motivo_decision === dto.motivo.trim() &&
        r.id_verificador === user
      )
        return;
      throw new ConflictException('Rectificación ya resuelta.');
    }
    if (
      dto.estado === 'confirmado' &&
      r.id_version_actual &&
      r.id_version !== r.id_version_actual &&
      !version
    )
      throw new ConflictException(
        'Prepara y aprueba una nueva versión R13 vinculada a esta rectificación.',
      );
    if (version) {
      const [v] = await m.query(
        'SELECT id_version FROM cronograma_version WHERE id_version=$1 AND id_rectificacion=$2',
        [version, id],
      );
      if (!v)
        throw new ConflictException('Versión de rectificación incompatible.');
    }
    await m.query(
      'UPDATE pago_rectificacion SET estado=$2,id_verificador=$3,motivo_decision=$4,clave_decision=$5,verificado_en=now() WHERE id_rectificacion=$1',
      [id, dto.estado, user, dto.motivo.trim(), dto.claveIdempotencia],
    );
    await this.event(m, r.id_pago, user, 'rectificacion_' + dto.estado, {
      idRectificacion: id,
      motivo: dto.motivo,
      idVersion: version ?? null,
    });
    if (dto.estado === 'confirmado') {
      const reopened = await m.query(
        `UPDATE cronograma_version v SET estado='en_ejecucion' FROM cronograma_pago cp WHERE cp.id_contrato=$1 AND cp.id_version_actual=v.id_version AND v.estado='completado' RETURNING v.id_version`,
        [r.id_contrato],
      );
      for (const v of reopened)
        await m.query(
          "INSERT INTO cronograma_evento(id_version,tipo,detalle,id_usuario) VALUES($1,'reapertura_rectificacion',$2::jsonb,$3)",
          [
            v.id_version,
            JSON.stringify({ idRectificacion: id, idPago: r.id_pago }),
            user,
          ],
        );
    }
  }
  async decideRectification(id: number, dto: PaymentDecisionDto, user: number) {
    if (!dto.motivo.trim())
      throw new BadRequestException('Fundamenta la decisión.');
    await this.db.transaction((m) => this.applyRectification(m, id, dto, user));
    return { ok: true };
  }
}
