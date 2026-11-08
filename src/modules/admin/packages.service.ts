import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { cents, decimal } from './money.js';
import type { PackageDto, PackageListDto } from './packages.dto.js';
import { ExistingPackagesStore } from './existing-packages.store.js';

export interface PackageRecord {
  guiaRecomendacion?: string | null;
  prestaciones?: string[];
  idServicio: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  publicoObjetivo: string | null;
  componentes: {
    idServicio: number;
    cantidad: number;
    nombre: string;
    codigo: string;
  }[];
  entregables: string[];
  restricciones: string[];
  precioFijo: string | null;
  moneda: string;
  modalidad: string;
  duracionDias: number | null;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  estado: string;
  version: number;
  fechaCreacion: string;
  fechaActualizacion: string;
}
const today = `(now() AT TIME ZONE 'America/Lima')::date`;
const valid = `es_paquete AND activo AND paquete_estado='activo' AND (vigencia_desde IS NULL OR vigencia_desde<=${today}) AND (vigencia_hasta IS NULL OR vigencia_hasta>=${today})`;
export function packageActivationError(
  p: Pick<
    PackageRecord,
    | 'descripcion'
    | 'precioFijo'
    | 'componentes'
    | 'entregables'
    | 'restricciones'
  >,
) {
  return !p.descripcion?.trim() ||
    p.precioFijo === null ||
    !p.componentes.length ||
    !p.entregables.length ||
    !p.restricciones.length
    ? 'Para activar completa descripción, precio fijo, servicios, entregables y restricciones.'
    : null;
}
@Injectable()
export class PackagesService {
  private readonly existing: ExistingPackagesStore;
  constructor(private readonly db: DataSource) {
    this.existing = new ExistingPackagesStore(db);
  }
  isExistingCatalog() {
    return this.existing.available();
  }
  contractSnapshot(raw: Record<string, any>) {
    return this.existing.contractSnapshot(raw);
  }
  async detail(
    id: number,
    m: EntityManager = this.db.manager,
  ): Promise<PackageRecord> {
    if (await this.existing.available()) return this.existing.detail(id, m);
    const [s] = await m.query(
      `SELECT *,vigencia_desde::text,vigencia_hasta::text FROM servicio WHERE id_servicio=$1 AND es_paquete`,
      [id],
    );
    if (!s) throw new NotFoundException('Paquete no encontrado.');
    const componentes = await m.query(
      `SELECT c.id_servicio AS "idServicio",c.cantidad,s.nombre,s.codigo FROM paquete_componente c JOIN servicio s USING(id_servicio) WHERE c.id_paquete=$1 ORDER BY c.id_servicio`,
      [id],
    );
    const [snapshot] = await m.query('SELECT contenido FROM paquete_version WHERE id_paquete=$1 AND version=$2', [id, s.paquete_version]);
    return {
      guiaRecomendacion: snapshot?.contenido?.guiaRecomendacion ?? null,
      prestaciones: snapshot?.contenido?.prestaciones ?? [],
      idServicio: s.id_servicio,
      codigo: s.codigo,
      nombre: s.nombre,
      descripcion: s.descripcion,
      publicoObjetivo: s.publico_objetivo,
      componentes,
      entregables: s.entregables,
      restricciones: s.restricciones,
      precioFijo: s.precio_base,
      moneda: s.moneda,
      modalidad: s.modalidad,
      duracionDias: s.duracion_dias,
      vigenciaDesde: s.vigencia_desde,
      vigenciaHasta: s.vigencia_hasta,
      estado: s.paquete_estado,
      version: s.paquete_version,
      fechaCreacion: s.fecha_creacion,
      fechaActualizacion: s.fecha_actualizacion,
    };
  }
  async save(dto: PackageDto, user: number, id?: number) {
    if (await this.existing.available())
      return this.existing.save(dto, user, id);
    return this.db.transaction(async (m) => {
      let prior: PackageRecord | null = null;
      if (id) {
        if (
          !(
            await m.query(
              'SELECT 1 FROM servicio WHERE id_servicio=$1 AND es_paquete FOR UPDATE',
              [id],
            )
          ).length
        )
          throw new NotFoundException('Paquete no encontrado.');
        prior = await this.detail(id, m);
        if (dto.version !== prior.version)
          throw new ConflictException(
            'El paquete cambió. Recarga antes de guardar.',
          );
      }
      if (
        dto.vigenciaDesde &&
        dto.vigenciaHasta &&
        dto.vigenciaDesde > dto.vigenciaHasta
      )
        throw new BadRequestException(
          'La vigencia final debe ser igual o posterior a la inicial.',
        );
      if (prior?.estado === 'inactivo' && dto.estado === 'borrador')
        throw new BadRequestException(
          'Un paquete publicado se reactiva o permanece inactivo; no vuelve a borrador.',
        );
      if (prior?.estado === 'activo' && dto.estado === 'borrador')
        throw new BadRequestException(
          'Desactiva el paquete para retirarlo del catálogo.',
        );
      const ids = dto.componentes.map((c) => c.idServicio);
      if (new Set(ids).size !== ids.length || (id && ids.includes(id)))
        throw new BadRequestException(
          'No repitas servicios ni incluyas el propio paquete.',
        );
      const parts = ids.length
        ? await m.query(
            'SELECT * FROM servicio WHERE id_servicio=ANY($1::int[]) ORDER BY id_servicio FOR SHARE',
            [ids],
          )
        : [];
      if (
        parts.length !== ids.length ||
        parts.some(
          (s: any) => s.es_paquete || (dto.estado === 'activo' && !s.activo),
        )
      )
        throw new BadRequestException(
          'Selecciona servicios individuales existentes y activos para publicar.',
        );
      const clean = (items: string[]) => items.map((s) => s.trim());
      const data = {
        componentes: dto.componentes,
        descripcion: dto.descripcion?.trim() || null,
        publicoObjetivo: dto.publicoObjetivo?.trim() || null,
        precioFijo:
          dto.precioFijo == null ? null : decimal(cents(dto.precioFijo)),
        entregables: clean(dto.entregables),
        restricciones: clean(dto.restricciones),
      };
      if ([...data.entregables, ...data.restricciones].some((s) => !s))
        throw new BadRequestException(
          'Retira o completa los elementos vacíos.',
        );
      if (dto.estado === 'activo') {
        const error = packageActivationError(data as PackageRecord);
        if (error) throw new BadRequestException(error);
      }
      const version = prior ? prior.version + 1 : 1;
      const fields: Record<string, unknown> = {
        codigo: dto.codigo,
        nombre: dto.nombre.trim(),
        descripcion: data.descripcion,
        publico_objetivo: data.publicoObjetivo,
        precio_base: data.precioFijo,
        moneda: dto.moneda,
        modalidad: dto.modalidad,
        duracion_dias: dto.duracionDias ?? null,
        entregables: JSON.stringify(data.entregables),
        restricciones: JSON.stringify(data.restricciones),
        vigencia_desde: dto.vigenciaDesde ?? null,
        vigencia_hasta: dto.vigenciaHasta ?? null,
        paquete_estado: dto.estado,
        paquete_version: version,
        activo: dto.estado === 'activo',
        es_paquete: true,
      };
      const cols = Object.keys(fields),
        values = Object.values(fields);
      if (id)
        await m.query(
          `UPDATE servicio SET ${cols.map((c, i) => `${c}=$${i + 1}`).join(',')},fecha_actualizacion=now() WHERE id_servicio=$${values.length + 1}`,
          [...values, id],
        );
      else {
        const [row] = await m.query(
          `INSERT INTO servicio(${cols.join(',')}) VALUES(${values.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id_servicio`,
          values,
        );
        id = row.id_servicio;
      }
      await m.query('DELETE FROM paquete_componente WHERE id_paquete=$1', [id]);
      for (const c of dto.componentes)
        await m.query(
          'INSERT INTO paquete_componente(id_paquete,id_servicio,cantidad) VALUES($1,$2,$3)',
          [id, c.idServicio, c.cantidad],
        );
      const record = await this.detail(id!, m);
      record.guiaRecomendacion = dto.guiaRecomendacion === undefined ? prior?.guiaRecomendacion ?? null : dto.guiaRecomendacion?.trim() || null;
      record.prestaciones = dto.prestaciones ?? prior?.prestaciones ?? [];
      const [previousVersion] = prior
        ? await m.query(
            'SELECT contenido FROM paquete_version WHERE id_paquete=$1 AND version=$2',
            [id, prior.version],
          )
        : [];
      const previous: PackageRecord | null =
        previousVersion?.contenido || prior;
      const changes = Object.fromEntries(
        Object.entries(record)
          .filter(
            ([k, v]) =>
              !['fechaCreacion', 'fechaActualizacion'].includes(k) &&
              JSON.stringify(previous?.[k as keyof PackageRecord]) !==
                JSON.stringify(v),
          )
          .map(([k, v]) => [
            k,
            {
              anterior: previous?.[k as keyof PackageRecord] ?? null,
              nuevo: v,
            },
          ]),
      );
      await m.query(
        'INSERT INTO paquete_version(id_paquete,version,contenido,cambios,id_usuario) VALUES($1,$2,$3,$4,$5)',
        [id, version, JSON.stringify(record), JSON.stringify(changes), user],
      );
      return record;
    });
  }
  async status(id: number, estado: string, version: number, user: number) {
    if (await this.existing.available())
      return this.existing.status(id, estado, version, user);
    const p = await this.detail(id);
    return this.save({ ...p, estado, version }, user, id);
  }
  async list(dto: PackageListDto) {
    if (await this.existing.available()) return this.existing.list(dto);
    if (
      dto.precioMin &&
      dto.precioMax &&
      cents(dto.precioMin) > cents(dto.precioMax)
    )
      throw new BadRequestException('Rango de precios inválido.');
    const filters = ['es_paquete'],
      values: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      filters.push(sql.replaceAll('?', `$${values.length}`));
    };
    if (dto.q) add('(nombre ILIKE ? OR codigo ILIKE ?)', `%${dto.q}%`);
    if (dto.estado) add('paquete_estado=?', dto.estado);
    if (dto.precioMin) add('precio_base>=?::numeric', dto.precioMin);
    if (dto.precioMax) add('precio_base<=?::numeric', dto.precioMax);
    if (dto.vigencia === 'vigente')
      filters.push(
        `(vigencia_desde IS NULL OR vigencia_desde<=${today}) AND (vigencia_hasta IS NULL OR vigencia_hasta>=${today})`,
      );
    if (dto.vigencia === 'futuro') filters.push(`vigencia_desde>${today}`);
    if (dto.vigencia === 'vencido') filters.push(`vigencia_hasta<${today}`);
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const [count] = await m.query(
        `SELECT count(*)::int AS total FROM servicio WHERE ${filters.join(' AND ')}`,
        values,
      );
      const rows = await m.query(
        `SELECT id_servicio FROM servicio WHERE ${filters.join(' AND ')} ORDER BY fecha_actualizacion DESC,id_servicio DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, dto.pageSize, (dto.page - 1) * dto.pageSize],
      );
      const items: PackageRecord[] = [];
      for (const r of rows) items.push(await this.detail(r.id_servicio, m));
      return {
        items,
        total: count.total,
        page: dto.page,
        pageSize: dto.pageSize,
      };
    });
  }
  async summary() {
    if (await this.existing.available()) return this.existing.summary();
    const [s] = await this.db.query(
      `SELECT count(*)::int AS total,count(*) FILTER(WHERE paquete_estado='activo')::int AS activos,count(*) FILTER(WHERE paquete_estado='borrador')::int AS borradores,count(*) FILTER(WHERE paquete_estado='inactivo')::int AS inactivos FROM servicio WHERE es_paquete`,
    );
    return s;
  }
  async catalogs() {
    if (await this.existing.available()) return this.existing.catalogs();
    return {
      servicios: await this.db.query(
        'SELECT id_servicio AS "idServicio",codigo,nombre FROM servicio WHERE activo AND NOT es_paquete ORDER BY nombre',
      ),
      monedas: ['PEN', 'USD', 'EUR'],
      modalidades: ['virtual', 'presencial', 'hibrida'],
    };
  }
  async history(id: number, dto: PackageListDto) {
    if (await this.existing.available()) return this.existing.history(id, dto);
    await this.detail(id);
    const [{ total }] = await this.db.query(
      'SELECT count(*)::int AS total FROM paquete_version WHERE id_paquete=$1',
      [id],
    );
    const items = await this.db.query(
      `SELECT v.id_version AS "idVersion",v.version,v.fecha,v.contenido,v.cambios,concat_ws(' ',u.nombres,u.apellidos) AS administrador FROM paquete_version v JOIN usuario_interno u USING(id_usuario) WHERE id_paquete=$1 ORDER BY version DESC LIMIT $2 OFFSET $3`,
      [id, dto.pageSize, (dto.page - 1) * dto.pageSize],
    );
    return { items, total, page: dto.page, pageSize: dto.pageSize };
  }
  async authorized() {
    if (await this.existing.available()) return this.existing.authorized();
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const rows = await m.query(
        `SELECT v.contenido FROM servicio s JOIN paquete_version v ON v.id_paquete=s.id_servicio AND v.version=s.paquete_version WHERE ${valid} ORDER BY s.nombre,s.id_servicio LIMIT 100`,
      );
      const records: PackageRecord[] = rows.map(
        (r: { contenido: PackageRecord }) => r.contenido,
      );
      return records.map(
        ({
          fechaCreacion: _created,
          fechaActualizacion: _updated,
          estado: _state,
          ...publicData
        }) => publicData,
      );
    });
  }
  async forProposal(m: EntityManager, id: number, version: number) {
    if (await this.existing.available())
      return this.existing.forProposal(m, id, version);
    const [s] = await m.query(
      `SELECT id_servicio FROM servicio WHERE id_servicio=$1 AND ${valid} FOR SHARE`,
      [id],
    );
    if (!s)
      throw new ConflictException(
        'El paquete ya no está disponible para nuevas propuestas.',
      );
    const p = await this.detail(id, m);
    if (p.version !== version)
      throw new ConflictException(
        'Cambió la versión del paquete. Revisa las condiciones actuales.',
      );
    const [v] = await m.query(
      'SELECT id_version,contenido FROM paquete_version WHERE id_paquete=$1 AND version=$2',
      [id, version],
    );
    if (!v)
      throw new ConflictException('No existe una versión comercial aprobada.');
    return {
      idVersion: v.id_version,
      paquete: v.contenido as PackageRecord,
      legacySnapshot: null as Record<string, any> | null,
    };
  }
}
