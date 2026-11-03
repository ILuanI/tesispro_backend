import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { cents, decimal } from './money.js';
import type { PackageDto, PackageListDto } from './packages.dto.js';
import type { PackageRecord } from './packages.service.js';

type Row = Record<string, any>;
export type ExistingPackageRecord = PackageRecord & {
  tipoPrecio: string;
  negociacionHabilitada: boolean;
  prestaciones: string[];
  catalogoExistente: true;
};
const date = (v: any) => (v instanceof Date ? v.toISOString() : v || null);
const state = (r: Row) =>
  r.estado === 'borrador'
    ? 'borrador'
    : r.estado === 'publicado' && r.publicado
      ? 'activo'
      : 'inactivo';

/** Adapter for the already populated paquete / paquete_version(datos) schema.
 * Does not rename tables, create versions on reads, or rewrite existing snapshots.
 */
export class ExistingPackagesStore {
  private detected?: Promise<boolean>;
  constructor(private readonly db: DataSource) {}
  available() {
    return (this.detected ??= this.db
      .query(
        `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='paquete_version' AND column_name='datos') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='paquete' AND column_name='id_servicio') AS legacy`,
      )
      .then(([r]: Row[]) => r.legacy)
      .catch((e) => {
        this.detected = undefined;
        throw e;
      }));
  }
  normalize(
    raw: Row,
    metadata: Row = raw.snapshot || raw,
    service?: Row,
  ): ExistingPackageRecord {
    const stored = metadata?._r11?.record;
    return {
      idServicio: Number(raw.id_servicio ?? stored?.idServicio),
      codigo: raw.codigo,
      nombre: raw.nombre,
      descripcion: raw.descripcion || null,
      publicoObjetivo: stored?.publicoObjetivo ?? null,
      componentes: stored?.componentes ?? [],
      entregables: raw.entregables || [],
      restricciones: raw.restricciones || [],
      precioFijo:
        raw.precio == null ? null : decimal(cents(String(raw.precio))),
      moneda: raw.moneda,
      modalidad:
        stored?.modalidad ||
        raw.servicio_modalidad ||
        service?.modalidad ||
        'virtual',
      duracionDias: raw.duracion_dias ?? null,
      vigenciaDesde: stored?.vigenciaDesde ?? null,
      vigenciaHasta: stored?.vigenciaHasta ?? null,
      estado: state(raw),
      version: raw.version,
      fechaCreacion: date(
        raw.fecha_creacion || stored?.fechaCreacion || raw.actualizado_en,
      ),
      fechaActualizacion: date(raw.actualizado_en),
      tipoPrecio: raw.precio_tipo || 'fijo',
      negociacionHabilitada: raw.negociacion_habilitada === true,
      prestaciones: raw.prestaciones || [],
      catalogoExistente: true,
    };
  }
  async row(id: number, m: EntityManager = this.db.manager, lock = false) {
    const [r] = await m.query(
      `SELECT p.*,s.modalidad AS servicio_modalidad,
      (SELECT min(fecha) FROM paquete_version v WHERE v.id_paquete=p.id) AS fecha_creacion,
      (SELECT datos FROM paquete_version v WHERE v.id_paquete=p.id AND v.version=p.version) AS snapshot
      FROM paquete p JOIN servicio s ON s.id_servicio=p.id_servicio WHERE p.id_servicio=$1 ${lock ? 'FOR UPDATE OF p' : ''}`,
      [id],
    );
    if (!r) throw new NotFoundException('Paquete no encontrado.');
    return r;
  }
  async detail(id: number, m: EntityManager = this.db.manager) {
    const r = await this.row(id, m);
    return this.normalize(r);
  }
  async save(dto: PackageDto, user: number, id?: number) {
    return this.db.transaction(async (m) => {
      const prior = id ? await this.row(id, m, true) : null;
      if (prior && dto.version !== prior.version)
        throw new ConflictException(
          'El paquete cambió. Recarga antes de guardar.',
        );
      if (prior && state(prior) !== 'borrador' && dto.estado === 'borrador')
        throw new BadRequestException(
          'Desactiva el paquete para retirarlo del catálogo.',
        );
      if (
        dto.vigenciaDesde &&
        dto.vigenciaHasta &&
        dto.vigenciaDesde > dto.vigenciaHasta
      )
        throw new BadRequestException('Rango de vigencia inválido.');
      const price =
        dto.precioFijo == null ? null : decimal(cents(dto.precioFijo));
      if (price !== null && cents(price) <= 0n)
        throw new BadRequestException(
          'El catálogo existente exige precio positivo o pendiente; no admite cero.',
        );
      const ids = dto.componentes.map((c) => c.idServicio);
      if (new Set(ids).size !== ids.length || (id && ids.includes(id)))
        throw new BadRequestException(
          'No repitas servicios ni incluyas el propio paquete.',
        );
      const parts = ids.length
        ? await m.query(
            `SELECT s.* FROM servicio s WHERE s.id_servicio=ANY($1::int[]) AND NOT EXISTS(SELECT 1 FROM paquete p WHERE p.id_servicio=s.id_servicio) ORDER BY s.id_servicio FOR SHARE OF s`,
            [ids],
          )
        : [];
      if (
        parts.length !== ids.length ||
        (dto.estado === 'activo' && parts.some((s: Row) => !s.activo))
      )
        throw new BadRequestException(
          'Selecciona servicios individuales existentes y activos.',
        );
      const entregables = dto.entregables.map((s) => s.trim()),
        restricciones = dto.restricciones.map((s) => s.trim());
      if ([...entregables, ...restricciones].some((s) => !s))
        throw new BadRequestException(
          'Completa o retira los elementos vacíos.',
        );
      if (
        dto.estado === 'activo' &&
        (!dto.descripcion?.trim() ||
          price === null ||
          !entregables.length ||
          !restricciones.length ||
          (!prior && !ids.length))
      )
        throw new BadRequestException(
          'Completa descripción, precio, servicios, entregables y restricciones antes de publicar.',
        );
      // Existing non-complementary categories require a configured duration. Never replace it with a fictitious value.
      if (
        prior &&
        prior.categoria !== 'complementario' &&
        dto.duracionDias == null
      )
        throw new BadRequestException(
          'La categoría existente requiere conservar o definir una duración.',
        );
      if (!prior) {
        const [s] = await m.query(
          `INSERT INTO servicio(codigo,nombre,descripcion,precio_base,moneda,modalidad,duracion_dias,activo) VALUES($1,$2,$3,$4,$5,$6,$7,false) RETURNING id_servicio`,
          [
            dto.codigo,
            dto.nombre.trim(),
            dto.descripcion || null,
            price ?? '0.00',
            dto.moneda,
            dto.modalidad,
            dto.duracionDias ?? null,
          ],
        );
        id = s.id_servicio;
      }
      const values = [
        dto.codigo,
        dto.nombre.trim(),
        dto.descripcion?.trim() || '',
        entregables,
        restricciones,
        price,
        dto.moneda,
        dto.duracionDias ?? null,
        dto.estado === 'activo',
        dto.estado === 'activo'
          ? 'publicado'
          : dto.estado === 'inactivo'
            ? 'archivado'
            : 'borrador',
      ];
      let packageId: number, version: number;
      if (prior) {
        version = prior.version + 1;
        packageId = prior.id;
        const negotiation = prior.snapshot?._r11?.creadoPorR11
          ? dto.estado === 'activo'
          : prior.negociacion_habilitada;
        await m.query(
          `UPDATE paquete SET codigo=$1,nombre=$2,descripcion=$3,entregables=$4,restricciones=$5,precio=$6,moneda=$7,duracion_dias=$8,publicado=$9,estado=$10,version=$11,actualizado_en=now(),negociacion_habilitada=$13 WHERE id=$12`,
          [...values, version, packageId, negotiation],
        );
      } else {
        version = 1;
        const [p] = await m.query(
          `INSERT INTO paquete(codigo,nombre,descripcion,entregables,restricciones,precio,moneda,duracion_dias,publicado,estado,categoria,precio_tipo,id_servicio,negociacion_habilitada) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'complementario','fijo',$11,$9) RETURNING id`,
          [...values, id],
        );
        packageId = p.id;
      }
      const raw = await this.row(id!, m);
      const record: ExistingPackageRecord = {
        ...this.normalize(raw),
        publicoObjetivo: dto.publicoObjetivo?.trim() || null,
        modalidad: dto.modalidad,
        componentes: dto.componentes.map((c) => {
          const s = parts.find((s: Row) => s.id_servicio === c.idServicio);
          return { idServicio:c.idServicio,cantidad:c.cantidad,nombre: s.nombre, codigo: s.codigo };
        }),
        vigenciaDesde: dto.vigenciaDesde || null,
        vigenciaHasta: dto.vigenciaHasta || null,
      };
      const before = prior ? this.normalize(prior) : null;
      const cambios = Object.fromEntries(
        Object.entries(record)
          .filter(
            ([k, v]) =>
              !['fechaActualizacion', 'fechaCreacion'].includes(k) &&
              JSON.stringify(before?.[k as keyof ExistingPackageRecord]) !==
                JSON.stringify(v),
          )
          .map(([k, v]) => [
            k,
            {
              anterior: before?.[k as keyof ExistingPackageRecord] ?? null,
              nuevo: v,
            },
          ]),
      );
      const {
        snapshot: _snapshot,
        servicio_modalidad: _mode,
        fecha_creacion: _created,
        ...original
      } = raw;
      await m.query(
        `INSERT INTO paquete_version(id_paquete,version,datos,id_usuario) VALUES($1,$2,$3,$4)`,
        [
          packageId,
          version,
          JSON.stringify({
            ...original,
            _r11: {
              record,
              cambios,
              creadoPorR11: prior
                ? prior.snapshot?._r11?.creadoPorR11 === true
                : true,
            },
          }),
          user,
        ],
      );
      return record;
    });
  }
  async status(id: number, estado: string, version: number, user: number) {
    const p = await this.detail(id);
    return this.save({ ...p, estado, version }, user, id);
  }
  async list(dto: PackageListDto) {
    if (
      dto.precioMin &&
      dto.precioMax &&
      cents(dto.precioMin) > cents(dto.precioMax)
    )
      throw new BadRequestException('Rango de precios inválido.');
    const filters = ['true'],
      values: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      values.push(v);
      filters.push(sql.replaceAll('?', `$${values.length}`));
    };
    if (dto.q) add('(p.nombre ILIKE ? OR p.codigo ILIKE ?)', `%${dto.q}%`);
    if (dto.estado)
      add(
        `(CASE WHEN p.estado='borrador' THEN 'borrador' WHEN p.estado='publicado' AND p.publicado THEN 'activo' ELSE 'inactivo' END)=?`,
        dto.estado,
      );
    if (dto.precioMin) add('p.precio>=?::numeric', dto.precioMin);
    if (dto.precioMax) add('p.precio<=?::numeric', dto.precioMax);
    const start = `NULLIF(v.datos->'_r11'->'record'->>'vigenciaDesde','')::date`,
      end = `NULLIF(v.datos->'_r11'->'record'->>'vigenciaHasta','')::date`,
      today = `(now() AT TIME ZONE 'America/Lima')::date`;
    if (dto.vigencia === 'vigente')
      filters.push(
        `(${start} IS NULL OR ${start}<=${today}) AND (${end} IS NULL OR ${end}>=${today})`,
      );
    if (dto.vigencia === 'futuro') filters.push(`${start}>${today}`);
    if (dto.vigencia === 'vencido') filters.push(`${end}<${today}`);
    const from = `FROM paquete p LEFT JOIN paquete_version v ON v.id_paquete=p.id AND v.version=p.version WHERE ${filters.join(' AND ')}`;
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const [{ total }] = await m.query(
        `SELECT count(*)::int AS total ${from}`,
        values,
      );
      const rows = await m.query(
        `SELECT p.id_servicio ${from} ORDER BY p.actualizado_en DESC,p.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, dto.pageSize, (dto.page - 1) * dto.pageSize],
      );
      const items = [];
      for (const r of rows) items.push(await this.detail(r.id_servicio, m));
      return { items, total, page: dto.page, pageSize: dto.pageSize };
    });
  }
  async summary() {
    const [r] = await this.db.query(
      `SELECT count(*)::int AS total,count(*) FILTER(WHERE estado='publicado' AND publicado)::int AS activos,count(*) FILTER(WHERE estado='borrador')::int AS borradores,count(*) FILTER(WHERE estado<>'borrador' AND NOT(estado='publicado' AND publicado))::int AS inactivos FROM paquete`,
    );
    return r;
  }
  async catalogs() {
    return {
      servicios: await this.db.query(
        `SELECT s.id_servicio AS "idServicio",s.codigo,s.nombre FROM servicio s WHERE s.activo AND NOT EXISTS(SELECT 1 FROM paquete p WHERE p.id_servicio=s.id_servicio) ORDER BY s.nombre`,
      ),
      monedas: ['PEN', 'USD', 'EUR'],
      modalidades: ['virtual', 'presencial', 'hibrida'],
    };
  }
  async history(id: number, dto: PackageListDto) {
    const p = await this.row(id);
    const [{ total }] = await this.db.query(
      'SELECT count(*)::int AS total FROM paquete_version WHERE id_paquete=$1',
      [p.id],
    );
    const rows = await this.db.query(
      `SELECT v.*,concat_ws(' ',u.nombres,u.apellidos) AS administrador FROM paquete_version v LEFT JOIN usuario_interno u USING(id_usuario) WHERE id_paquete=$1 ORDER BY version DESC LIMIT $2 OFFSET $3`,
      [p.id, dto.pageSize, (dto.page - 1) * dto.pageSize],
    );
    return {
      items: rows.map((v: Row) => ({
        idVersion: `${v.id_paquete}:${v.version}`,
        version: v.version,
        fecha: v.fecha,
        administrador: v.administrador || 'Registro histórico',
        contenido: this.normalize(
          { ...v.datos, id_servicio: p.id_servicio },
          v.datos,
          p,
        ),
        cambios: v.datos._r11?.cambios || {},
      })),
      total,
      page: dto.page,
      pageSize: dto.pageSize,
    };
  }
  private eligible(p: ExistingPackageRecord) {
    const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    return (
      p.estado === 'activo' &&
      p.tipoPrecio === 'fijo' &&
      p.precioFijo !== null &&
      (!p.vigenciaDesde || p.vigenciaDesde <= today) &&
      (!p.vigenciaHasta || p.vigenciaHasta >= today)
    );
  }
  async authorized() {
    const rows = await this.db.query(
      `SELECT p.id_servicio FROM paquete p WHERE p.publicado AND p.estado='publicado' AND p.precio_tipo='fijo' AND p.negociacion_habilitada ORDER BY p.nombre LIMIT 100`,
    );
    const result = [];
    for (const row of rows) {
      const raw = await this.row(row.id_servicio);
      if (!raw.snapshot) continue;
      const p = this.normalize(
        {
          ...raw.snapshot,
          id_servicio: raw.id_servicio,
          servicio_modalidad: raw.servicio_modalidad,
        },
        raw.snapshot,
      );
      if (this.eligible(p) && p.negociacionHabilitada) {
        const {
          fechaCreacion: _c,
          fechaActualizacion: _u,
          estado: _s,
          ...publicData
        } = p;
        result.push(publicData);
      }
    }
    return result;
  }
  async forProposal(m: EntityManager, id: number, version: number) {
    const raw = await this.row(id, m, true);
    const p = this.normalize(raw);
    if (!this.eligible(p) || p.version !== version || !raw.snapshot)
      throw new ConflictException(
        'El paquete o su versión ya no están disponibles como precio fijo vigente.',
      );
    return {
      idVersion: null,
      paquete: this.normalize(
        {
          ...raw.snapshot,
          id_servicio: raw.id_servicio,
          servicio_modalidad: raw.servicio_modalidad,
        },
        raw.snapshot,
      ),
      legacySnapshot: {
        ...raw.snapshot,
        _r11: {
          ...raw.snapshot._r11,
          record: this.normalize(
            {
              ...raw.snapshot,
              id_servicio: raw.id_servicio,
              servicio_modalidad: raw.servicio_modalidad,
            },
            raw.snapshot,
          ),
        },
      },
    };
  }
  contractSnapshot(raw: Row): PackageRecord | null {
    if (!raw) return null;
    return raw._r11?.record || this.normalize(raw.paquete || raw.datos || raw);
  }
}
