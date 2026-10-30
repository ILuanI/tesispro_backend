import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AdminService } from './admin.service.js';
import {
  ContractTermsDto,
  CreateContractDto,
  UpdateContractDto,
} from './contracts.dto.js';
import { cents, decimal } from './money.js';

const camel = (row: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      value,
    ]),
  );
const limit = 9999999999n;
@Injectable()
export class ContractsService {
  constructor(
    private readonly db: DataSource,
    private readonly admin: AdminService,
  ) {}

  async catalogos() {
    return {
      servicios: (
        await this.db.query(
          'SELECT id_servicio,codigo,nombre FROM servicio WHERE activo=true ORDER BY nombre',
        )
      ).map(camel),
      monedas: ['PEN', 'USD', 'EUR'],
      modalidades: ['virtual', 'presencial', 'hibrida'],
    };
  }
  private async dependencies(id: number, m: EntityManager) {
    const [row] = await m.query(
      `SELECT EXISTS(SELECT 1 FROM cronograma_pago WHERE id_contrato=$1)
      OR EXISTS(SELECT 1 FROM pago WHERE id_contrato=$1) AS bloqueado`,
      [id],
    );
    return row.bloqueado as boolean;
  }
  async detail(id: number) {
    // Una misma instantánea evita mezclar cabecera y detalles durante una edición.
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const contract = await this.admin.contrato(id, m);
      const [terms] = await m.query(
        'SELECT * FROM propuesta WHERE id_propuesta=$1',
        [contract.id_propuesta],
      );
      const lines = await m.query(
        `SELECT d.*,s.nombre AS servicio_nombre FROM propuesta_detalle d
        JOIN servicio s USING(id_servicio) WHERE id_propuesta=$1 ORDER BY id_detalle`,
        [contract.id_propuesta],
      );
      const locked = await this.dependencies(id, m);
      return {
        ...camel(contract),
        propuesta: { ...camel(terms), detalles: lines.map(camel) },
        editableFinanciero: !locked,
        eliminable: !locked,
      };
    });
  }
  private async validateTerms(
    dto: ContractTermsDto,
    m: EntityManager,
    proposalId?: string,
  ) {
    const ids = [...new Set(dto.detalles.map((line) => line.idServicio))];
    // Permite conservar líneas históricas de servicios desactivados, sin añadirlos a contratos nuevos.
    const services = await m.query(
      `SELECT id_servicio,activo FROM servicio WHERE id_servicio=ANY($1::int[]) FOR SHARE`,
      [ids],
    );
    const prior = proposalId
      ? await m.query(
          'SELECT DISTINCT id_servicio FROM propuesta_detalle WHERE id_propuesta=$1',
          [proposalId],
        )
      : [];
    for (const id of ids) {
      const service = services.find((item: any) => item.id_servicio === id);
      if (
        !service ||
        (!service.activo && !prior.some((item: any) => item.id_servicio === id))
      )
        throw new BadRequestException(
          'Selecciona servicios activos existentes.',
        );
    }
    let total = 0n;
    for (const line of dto.detalles) {
      const gross = BigInt(line.cantidad) * cents(line.precioUnitario);
      const discount = cents(line.descuento);
      if (discount > gross)
        throw new BadRequestException(
          'El descuento no puede superar el importe de la línea.',
        );
      const subtotal = gross - discount;
      if (subtotal > limit)
        throw new BadRequestException(
          'El subtotal supera el importe permitido.',
        );
      total += subtotal;
    }
    if (total <= 0n || total > limit)
      throw new BadRequestException(
        'El total debe ser positivo y no superar 99999999.99.',
      );
    return decimal(total);
  }
  private async lines(
    m: EntityManager,
    proposalId: string,
    dto: ContractTermsDto,
  ) {
    for (const line of dto.detalles)
      await m.query(
        `INSERT INTO propuesta_detalle
      (id_propuesta,id_servicio,descripcion,cantidad,precio_unitario,descuento,id_etapa) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [
          proposalId,
          line.idServicio,
          line.descripcion?.trim() || null,
          line.cantidad,
          line.precioUnitario,
          line.descuento,
          line.idEtapa ?? null,
        ],
      );
  }
  async create(dto: CreateContractDto, userId: number) {
    if (BigInt(dto.idLead) > 9223372036854775807n)
      throw new BadRequestException('ID de lead inválido.');
    const id = await this.db.transaction(async (m) => {
      const [lead] = await m.query(
        'SELECT id_lead FROM lead WHERE id_lead=$1 FOR KEY SHARE',
        [dto.idLead],
      );
      if (!lead) throw new NotFoundException('Lead no encontrado.');
      const p = dto.propuesta;
      const total = await this.validateTerms(p, m);
      const [proposal] = await m.query(
        `INSERT INTO propuesta(id_lead,id_usuario,estado,modalidad,tiempo_entrega_dias,
        monto_total,moneda,condiciones,fecha_respuesta) VALUES($1,$2,'aceptada',$3,$4,$5,$6,$7,$8) RETURNING id_propuesta`,
        [
          dto.idLead,
          userId,
          p.modalidad,
          p.tiempoEntregaDias ?? null,
          total,
          p.moneda,
          p.condiciones?.trim() || null,
          dto.fechaFirma,
        ],
      );
      await this.lines(m, proposal.id_propuesta, p);
      const [contract] = await m.query(
        `INSERT INTO contrato(id_lead,id_propuesta,fecha_firma,version_clausulas,acepta_autoria_estudiante,archivo_url)
        VALUES($1,$2,$3,$4,true,$5) RETURNING id_contrato`,
        [
          dto.idLead,
          proposal.id_propuesta,
          dto.fechaFirma,
          dto.versionClausulas.trim(),
          dto.archivoUrl || null,
        ],
      );
      return contract.id_contrato as number;
    });
    return this.detail(id);
  }
  async update(id: number, dto: UpdateContractDto) {
    if (!Object.values(dto).some((value) => value !== undefined))
      throw new BadRequestException('No hay cambios para guardar.');
    await this.db.transaction(async (m) => {
      const contract = await this.admin.contrato(id, m, true);
      const locked = await this.dependencies(id, m);
      if (
        locked &&
        (dto.propuesta !== undefined ||
          dto.fechaFirma !== undefined ||
          dto.aceptaAutoriaEstudiante !== undefined)
      )
        throw new ConflictException(
          'Este contrato tiene cronograma o pagos. Solo puedes editar archivo y versión de cláusulas.',
        );
      await m.query(
        'SELECT id_propuesta FROM propuesta WHERE id_propuesta=$1 FOR UPDATE',
        [contract.id_propuesta],
      );
      if (dto.propuesta) {
        const p = dto.propuesta;
        const total = await this.validateTerms(p, m, contract.id_propuesta);
        await m.query(
          `UPDATE propuesta SET modalidad=$1,tiempo_entrega_dias=$2,monto_total=$3,moneda=$4,condiciones=$5 WHERE id_propuesta=$6`,
          [
            p.modalidad,
            p.tiempoEntregaDias ?? null,
            total,
            p.moneda,
            p.condiciones?.trim() || null,
            contract.id_propuesta,
          ],
        );
        await m.query('DELETE FROM propuesta_detalle WHERE id_propuesta=$1', [
          contract.id_propuesta,
        ]);
        await this.lines(m, contract.id_propuesta, p);
      }
      if (dto.fechaFirma)
        await m.query(
          'UPDATE propuesta SET fecha_respuesta=$1 WHERE id_propuesta=$2',
          [dto.fechaFirma, contract.id_propuesta],
        );
      await m.query(
        `UPDATE contrato SET fecha_firma=$1,version_clausulas=$2,archivo_url=$3 WHERE id_contrato=$4`,
        [
          dto.fechaFirma ?? contract.fecha_firma,
          dto.versionClausulas?.trim() ?? contract.version_clausulas,
          dto.archivoUrl === undefined ? contract.archivo_url : dto.archivoUrl,
          id,
        ],
      );
    });
    return this.detail(id);
  }
  async remove(id: number) {
    await this.db.transaction(async (m) => {
      await this.admin.contrato(id, m, true);
      if (await this.dependencies(id, m))
        throw new ConflictException(
          'No se puede eliminar un contrato con cronograma o pagos.',
        );
      await m.query('DELETE FROM contrato WHERE id_contrato=$1', [id]);
    });
    return { ok: true };
  }
}
