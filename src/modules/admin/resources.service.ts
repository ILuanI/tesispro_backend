import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ResourceDto,
  ResourceListDto,
  resourceCategories,
  resourceFormats,
} from './resources.dto.js';

export interface ResourceUpload {
  originalname: string;
  buffer: Buffer;
  size: number;
}
const columns = `r.id_recurso AS "idRecurso", r.titulo, r.descripcion, r.categoria, r.formato, r.activo,
  r.publicado,r.destacado,
  r.id_etapa AS "idEtapa", r.id_grado AS "idGrado", e.nombre AS "etapaNombre", g.nombre AS "gradoNombre",
  r.archivo_url AS "archivoUrl", r.archivo_nombre AS "archivoNombre",
  octet_length(r.archivo_contenido) AS "archivoBytes", (r.archivo_contenido IS NOT NULL) AS "archivoSubido",
  r.fecha_creacion AS "fechaCreacion", r.fecha_actualizacion AS "fechaActualizacion"`;
const joins =
  'FROM recurso_gratuito r LEFT JOIN etapa_tesis e USING(id_etapa) LEFT JOIN grado_academico g ON g.id_grado=r.id_grado';

export function validateResourceUpload(file: ResourceUpload, format: string) {
  const bytes = file.buffer;
  // Busboy interpreta por defecto los nombres multipart como Latin-1.
  // Recupera UTF-8 si es válido, conservando nombres que ya estén decodificados.
  let filename = file.originalname;
  if (filename.split('').every((char) => char.charCodeAt(0) <= 255)) {
    try {
      filename = new TextDecoder('utf-8', { fatal: true }).decode(
        Buffer.from(filename, 'latin1'),
      );
    } catch {
      /* El nombre original ya utiliza su codificación correcta. */
    }
  }
  const ext = file.originalname.split('.').pop()?.toLowerCase();
  const starts = (hex: string) =>
    bytes.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  let mime = '';
  if (
    format === 'pdf' &&
    ext === 'pdf' &&
    bytes.subarray(0, 5).toString() === '%PDF-'
  )
    mime = 'application/pdf';
  if (format === 'png' && ext === 'png' && starts('89504e470d0a1a0a'))
    mime = 'image/png';
  if (format === 'word' && ext === 'docx' && starts('504b0304'))
    mime =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (format === 'word' && ext === 'doc' && starts('d0cf11e0a1b11ae1'))
    mime = 'application/msword';
  if (
    format === 'video' &&
    ['mp4', 'mov'].includes(ext || '') &&
    bytes.subarray(4, 8).toString() === 'ftyp'
  )
    mime = ext === 'mov' ? 'video/quicktime' : 'video/mp4';
  if (format === 'video' && ext === 'webm' && starts('1a45dfa3'))
    mime = 'video/webm';
  if (!mime || !file.size || file.size > 25 * 1024 * 1024)
    throw new BadRequestException(
      'El archivo no coincide con el formato elegido o supera los 25 MB. Usa PDF, DOC/DOCX, MP4/MOV/WebM o PNG.',
    );
  return {
    mime,
    // Elimina controles y separadores antes de construir el nombre de descarga.
    // eslint-disable-next-line no-control-regex
    name: filename.replace(/[\\/\x00-\x1f\x7f]/g, '_').slice(-255),
  };
}

@Injectable()
export class ResourcesService {
  constructor(private readonly db: DataSource) {}
  async catalogos() {
    return {
      categorias: resourceCategories,
      formatos: resourceFormats,
      etapas: await this.db.query(
        'SELECT id_etapa AS "idEtapa", id_grado AS "idGrado", nombre FROM etapa_tesis ORDER BY orden,nombre',
      ),
      grados: await this.db.query(
        'SELECT id_grado AS "idGrado", nombre FROM grado_academico ORDER BY id_grado',
      ),
    };
  }
  async list(dto: ResourceListDto) {
    if (dto.desde && dto.hasta && dto.desde > dto.hasta)
      throw new BadRequestException(
        'La fecha inicial no puede ser posterior a la final.',
      );
    const values: unknown[] = [],
      clauses: string[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      clauses.push(sql.replaceAll('?', `$${values.length}`));
    };
    if (dto.q)
      add(
        "(r.titulo ILIKE ? OR coalesce(r.descripcion,'') ILIKE ?)",
        `%${dto.q.replace(/[\\%_]/g, '\\$&')}%`,
      );
    for (const [key, column] of [
      ['categoria', 'categoria'],
      ['formato', 'formato'],
      ['activo', 'activo'],
      ['publicado', 'publicado'],
      ['destacado', 'destacado'],
      ['idEtapa', 'id_etapa'],
      ['idGrado', 'id_grado'],
    ] as const) {
      if (dto[key] !== undefined) add(`r.${column} = ?`, dto[key]);
    }
    if (dto.desde)
      add(
        "r.fecha_creacion >= (?::date::timestamp AT TIME ZONE 'America/Lima')",
        dto.desde,
      );
    if (dto.hasta)
      add(
        "r.fecha_creacion < ((?::date + 1)::timestamp AT TIME ZONE 'America/Lima')",
        dto.hasta,
      );
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const order = {
      titulo: 'r.titulo',
      fechaCreacion: 'r.fecha_creacion',
      fechaActualizacion: 'r.fecha_actualizacion',
      categoria: 'r.categoria',
      formato: 'r.formato',
    }[dto.sort];
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const [{ total }] = await m.query(
        `SELECT count(*)::int AS total FROM recurso_gratuito r ${where}`,
        values,
      );
      const items = await m.query(
        `SELECT ${columns} ${joins} ${where} ORDER BY ${order} ${dto.direction === 'asc' ? 'ASC' : 'DESC'},r.id_recurso DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, dto.pageSize, (dto.page - 1) * dto.pageSize],
      );
      return { items, total, page: dto.page, pageSize: dto.pageSize };
    });
  }
  async detail(id: number) {
    const [row] = await this.db.query(
      `SELECT ${columns} ${joins} WHERE r.id_recurso=$1`,
      [id],
    );
    if (!row) throw new NotFoundException('Recurso no encontrado.');
    return row;
  }
  async save(dto: ResourceDto, file?: ResourceUpload, id?: number) {
    if (file && dto.archivoUrl)
      throw new BadRequestException('Elige un archivo o un enlace, no ambos.');
    const upload = file ? validateResourceUpload(file, dto.formato) : null;
    return this.db.transaction(async (m) => {
      const [prior] = id
        ? await m.query(
            'SELECT id_recurso,formato,archivo_url,publicado,destacado,archivo_contenido IS NOT NULL AS subido FROM recurso_gratuito WHERE id_recurso=$1 FOR UPDATE',
            [id],
          )
        : [];
      if (id && !prior) throw new NotFoundException('Recurso no encontrado.');
      const publicado = dto.publicado ?? prior?.publicado ?? false;
      const destacado =
        dto.destacado ??
        (dto.activo && publicado ? (prior?.destacado ?? false) : false);
      if (destacado && (!publicado || !dto.activo))
        throw new BadRequestException(
          'Un recurso destacado debe estar publicado y activo.',
        );
      if (!file && !dto.archivoUrl && !prior)
        throw new BadRequestException(
          'Añade un archivo o una URL del recurso.',
        );
      if (!file && !dto.archivoUrl && prior && prior.formato !== dto.formato)
        throw new BadRequestException(
          'Para cambiar el formato, reemplaza también el archivo o su enlace.',
        );
      if (dto.idGrado) {
        const [grade] = await m.query(
          'SELECT id_grado FROM grado_academico WHERE id_grado=$1',
          [dto.idGrado],
        );
        if (!grade) throw new BadRequestException('Grado académico no válido.');
      }
      if (dto.idEtapa) {
        const [stage] = await m.query(
          'SELECT id_grado FROM etapa_tesis WHERE id_etapa=$1',
          [dto.idEtapa],
        );
        if (
          !stage ||
          (stage.id_grado && dto.idGrado && stage.id_grado !== dto.idGrado)
        )
          throw new BadRequestException(
            'La etapa no existe o no corresponde al grado seleccionado.',
          );
      }
      const values = [
        dto.titulo,
        dto.descripcion || null,
        dto.categoria,
        dto.formato,
        dto.activo,
        dto.idEtapa || null,
        dto.idGrado || null,
      ];
      const base =
        'titulo=$1,descripcion=$2,categoria=$3,formato=$4,tipo=$4,activo=$5,destacado=CASE WHEN $5 THEN destacado ELSE false END,id_etapa=$6,id_grado=$7,fecha_actualizacion=now()';
      let resourceId: number;
      if (id) {
        await m.query(
          `UPDATE recurso_gratuito SET ${base} WHERE id_recurso=$8`,
          [...values, id],
        );
        resourceId = id;
      } else {
        const [row] = await m.query(
          `INSERT INTO recurso_gratuito(titulo,descripcion,categoria,formato,tipo,activo,id_etapa,id_grado,archivo_url) VALUES($1,$2,$3,$4,$4,$5,$6,$7,'') RETURNING id_recurso`,
          values,
        );
        resourceId = row.id_recurso;
      }
      await m.query(
        'UPDATE recurso_gratuito SET publicado=$1,destacado=$2 WHERE id_recurso=$3',
        [publicado, destacado, resourceId],
      );
      if (file && upload) {
        await m.query(
          'UPDATE recurso_gratuito SET archivo_url=$1,archivo_nombre=$2,archivo_mime=$3,archivo_contenido=$4 WHERE id_recurso=$5',
          [
            `/api/admin/recursos/${resourceId}/archivo`,
            upload.name,
            upload.mime,
            file.buffer,
            resourceId,
          ],
        );
      } else if (dto.archivoUrl) {
        await m.query(
          'UPDATE recurso_gratuito SET archivo_url=$1,archivo_nombre=NULL,archivo_mime=NULL,archivo_contenido=NULL WHERE id_recurso=$2',
          [dto.archivoUrl, resourceId],
        );
      }
      const [row] = await m.query(
        `SELECT ${columns} ${joins} WHERE r.id_recurso=$1`,
        [resourceId],
      );
      return row;
    });
  }
  async status(id: number, activo: boolean) {
    const [, affected] = await this.db.query(
      'UPDATE recurso_gratuito SET activo=$1,destacado=CASE WHEN $1 THEN destacado ELSE false END,fecha_actualizacion=now() WHERE id_recurso=$2 RETURNING id_recurso',
      [activo, id],
    );
    if (!affected) throw new NotFoundException('Recurso no encontrado.');
    return this.detail(id);
  }
  async remove(id: number) {
    try {
      const [, affected] = await this.db.query(
        'DELETE FROM recurso_gratuito WHERE id_recurso=$1 RETURNING id_recurso',
        [id],
      );
      if (!affected) throw new NotFoundException('Recurso no encontrado.');
    } catch (error) {
      if (
        (error as { driverError?: { code?: string } }).driverError?.code ===
        '23503'
      )
        throw new ConflictException(
          'El recurso tiene descargas o sesiones asociadas. Puedes desactivarlo para conservar su historial.',
        );
      throw error;
    }
    return { ok: true };
  }
  async download(id: number) {
    const [row] = await this.db.query(
      'SELECT archivo_nombre,archivo_mime,archivo_contenido FROM recurso_gratuito WHERE id_recurso=$1',
      [id],
    );
    if (!row?.archivo_contenido)
      throw new NotFoundException(
        'El recurso no tiene un archivo subido. Utiliza su enlace externo.',
      );
    return new StreamableFile(row.archivo_contenido, {
      type: row.archivo_mime,
      length: row.archivo_contenido.length,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(row.archivo_nombre).replace(/'/g, '%27')}`,
    });
  }
}
