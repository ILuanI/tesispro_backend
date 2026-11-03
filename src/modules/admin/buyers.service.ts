import { ContactIdentityService } from './contact-identity.service.js';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { CondicionAcademica } from '../../common/enums/database.enums.js';
import {
  BuyerDto,
  BuyerListDto,
  CaptureBuyerDto,
  buyerChannels,
  buyerReasons,
} from './buyers.dto.js';

import { profileJourneyFilter } from './journey-filters.js';
import { ReferralsService, referralPhone } from './referrals.service.js';
import type { ProfilePageDto } from './lead-profile.dto.js';

type Row = Record<string, any>;
const camel = (row: Row) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      value,
    ]),
  );
const age = `CASE WHEN b.fecha_nacimiento IS NOT NULL THEN extract(year FROM age((now() AT TIME ZONE 'America/Lima')::date,b.fecha_nacimiento))::int ELSE b.edad_declarada END`;
const select = `SELECT b.*,b.fecha_nacimiento::text AS fecha_nacimiento,${age} AS edad,
  coalesce(u.nombre,b.universidad_otra) AS universidad_nombre,g.nombre AS grado_nombre,e.nombre AS etapa_nombre
  FROM buyer b LEFT JOIN universidad u USING(id_universidad) LEFT JOIN grado_academico g ON g.id_grado=b.id_grado LEFT JOIN etapa_tesis e ON e.id_etapa=b.id_etapa`;
const map = (rows: Row[]) => rows.map(camel);

@Injectable()
export class BuyersService {
  constructor(private readonly db: DataSource, private readonly referrals: ReferralsService, private readonly identity:ContactIdentityService) {}
  async catalogos() {
    const [universidades, grados, etapas, estadosLead] = await Promise.all([
      this.db.query(
        'SELECT id_universidad,nombre,activa FROM universidad ORDER BY nombre',
      ),
      this.db.query(
        'SELECT id_grado,nombre FROM grado_academico ORDER BY id_grado',
      ),
      this.db.query(
        'SELECT id_etapa,id_grado,nombre FROM etapa_tesis ORDER BY orden,nombre',
      ),
      this.db.query(
        'SELECT id_estado,codigo,nombre FROM estado_lead ORDER BY orden',
      ),
    ]);
    return {
      universidades: map(universidades),
      grados: map(grados),
      etapas: map(etapas),
      estadosLead: map(estadosLead),
      canales: buyerChannels,
      motivos: buyerReasons,
      condiciones: Object.values(CondicionAcademica),
    };
  }
  async list(dto: BuyerListDto) {
    if (dto.desde && dto.hasta && dto.desde > dto.hasta)
      throw new BadRequestException('El rango de fechas es inválido.');
    if (
      dto.edadMin !== undefined &&
      dto.edadMax !== undefined &&
      dto.edadMin > dto.edadMax
    )
      throw new BadRequestException('El rango de edad es inválido.');
    const values: unknown[] = [],
      clauses = ["b.estado='buyer'"];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      clauses.push(sql.replaceAll('?', `$${values.length}`));
    };
    if (dto.q)
      add(
        "(concat_ws(' ',b.nombres,b.apellidos) ILIKE ? OR b.correo ILIKE ? OR b.telefono ILIKE ? OR coalesce(u.nombre,b.universidad_otra,'') ILIKE ?)",
        `%${dto.q.replace(/[\\%_]/g, '\\$&')}%`,
      );
    for (const [key, col] of [
      ['canal', 'canal_origen'],
      ['motivoCaptacion', 'motivo_captacion'],
      ['condicion', 'condicion'],
      ['idUniversidad', 'id_universidad'],
      ['idGrado', 'id_grado'],
      ['idEtapa', 'id_etapa'],
    ] as const)
      if (dto[key] !== undefined) add(`b.${col}=?`, dto[key]);
    if (dto.departamento)
      add(
        'b.departamento ILIKE ?',
        `%${dto.departamento.replace(/[\\%_]/g, '\\$&')}%`,
      );
    if (dto.edadMin !== undefined) add(`${age} >= ?`, dto.edadMin);
    if (dto.edadMax !== undefined) add(`${age} <= ?`, dto.edadMax);
    if (dto.desde)
      add(
        "b.fecha_registro >= (?::date::timestamp AT TIME ZONE 'America/Lima')",
        dto.desde,
      );
    if (dto.hasta)
      add(
        "b.fecha_registro < ((?::date+1)::timestamp AT TIME ZONE 'America/Lima')",
        dto.hasta,
      );
    const order = {
      fechaRegistro: 'fecha_registro',
      nombres: 'nombres',
      edad: 'edad',
      canalOrigen: 'canal_origen',
      departamento: 'departamento',
    }[dto.sort];
    const activity = profileJourneyFilter(dto, values, 'b.id_buyer', 'buyer');
    if (activity) clauses.push(activity);
    const sql = `${select} WHERE ${clauses.join(' AND ')}`;
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const [{ total }] = await m.query(
        `SELECT count(*)::int AS total FROM (${sql}) x`,
        values,
      );
      const items = await m.query(
        `${sql} ORDER BY ${order} ${dto.direction === 'asc' ? 'ASC' : 'DESC'} NULLS LAST,b.id_buyer DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, dto.pageSize, (dto.page - 1) * dto.pageSize],
      );
      return {
        items: map(items),
        total,
        page: dto.page,
        pageSize: dto.pageSize,
      };
    });
  }
  async detail(id: string, m: EntityManager = this.db.manager) {
    const [row] = await m.query(
      `${select} WHERE b.id_buyer=$1 AND b.estado='buyer'`,
      [id],
    );
    if (!row)
      throw new NotFoundException(
        'Buyer no encontrado o ya convertido a lead.',
      );
    return camel(row);
  }
  async leadOrigin(id: string) {
    const [row] = await this.db.query(`${select} WHERE b.id_lead=$1`, [id]);
    return row ? camel(row) : null;
  }
  async interactions(id: string, dto: ProfilePageDto) {
    await this.detail(id);
    const sql = `SELECT 'perfil:'||id_evento AS referencia,tipo,fecha,origen,despues AS detalle FROM evento_perfil WHERE id_buyer=$1
      UNION ALL SELECT 'mensaje:'||m.id_mensaje,'mensaje',m.enviado_en,'tesi',jsonb_build_object('contenido',m.contenido,'remitente',m.remitente)
      FROM mensaje m JOIN conversacion c USING(id_conversacion)
      WHERE EXISTS(SELECT 1 FROM acceso_contacto a WHERE a.id_sesion=c.id_sesion AND a.id_buyer=$1)`;
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const [{total}] = await m.query(`SELECT count(*)::int AS total FROM (${sql}) t`,[id]);
      const items = await m.query(`SELECT * FROM (${sql}) t ORDER BY fecha DESC,referencia DESC LIMIT $2 OFFSET $3`,[id,dto.pageSize,(dto.page-1)*dto.pageSize]);
      return {items,total,page:dto.page,pageSize:dto.pageSize};
    });
  }
  private async validate(dto: BuyerDto, m: EntityManager) {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    if (
      dto.fechaNacimiento &&
      (dto.fechaNacimiento > today ||
        Number(today.slice(0, 4)) - Number(dto.fechaNacimiento.slice(0, 4)) >
          120)
    )
      throw new BadRequestException('La fecha de nacimiento no es válida.');
    if (new Date(dto.fechaRegistro).getTime() > Date.now() + 60000)
      throw new BadRequestException(
        'La fecha de captación no puede estar en el futuro.',
      );
    if (dto.idUniversidad && dto.universidadOtra)
      throw new BadRequestException(
        'Selecciona una universidad o escribe otra, no ambas.',
      );
    for (const [id, table, column] of [
      [dto.idUniversidad, 'universidad', 'id_universidad'],
      [dto.idGrado, 'grado_academico', 'id_grado'],
    ] as const) {
      if (
        id &&
        !(await m.query(`SELECT 1 FROM ${table} WHERE ${column}=$1`, [id]))
          .length
      )
        throw new BadRequestException('La universidad o el grado no existe.');
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
          'La etapa no corresponde al grado seleccionado.',
        );
    }
  }
  async save(dto: BuyerDto, user: number, id?: string) {
    return this.db.transaction(async (m) => {
      let before: Row | null = null;
      if (id) {
        const [current] = await m.query(
          'SELECT * FROM buyer WHERE id_buyer=$1 FOR UPDATE',
          [id],
        );
        if (!current) throw new NotFoundException('Buyer no encontrado.');
        if (current.estado !== 'buyer')
          throw new ConflictException(
            'Este perfil ya fue convertido. Edítalo desde Leads.',
          );
        if(dto.revision!==current.revision)throw new ConflictException('El perfil cambió. Recarga la ficha antes de guardar.');
        before=current;
      }
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        dto.correo || dto.telefono,
      ]);
      if (
        (
          await m.query('SELECT 1 FROM lead WHERE lower(correo)=$1', [
            dto.correo,
          ])
        ).length
      )
        throw new ConflictException(
          'Este correo ya pertenece a un lead. Gestiona su perfil desde Leads.',
        );
      await this.validate(dto, m);
      const owner=await this.identity.resolve(m,dto.correo,dto.telefono);
      if(owner && (!id || owner.id_buyer!==id))throw new ConflictException('El contacto ya existe. Gestiona su perfil actual.');
      const fields: Row = {
        nombres: dto.nombres?.trim() || null,
        apellidos: dto.apellidos || null,
        correo: dto.correo || null,
        telefono: dto.telefono || null,
        fecha_nacimiento: dto.fechaNacimiento || null,
        edad_declarada: dto.fechaNacimiento
          ? null
          : (dto.edadDeclarada ?? null),
        departamento: dto.departamento || null,
        id_universidad: dto.idUniversidad || null,
        universidad_otra: dto.universidadOtra || null,
        id_grado: dto.idGrado || null,
        condicion: dto.condicion || null,
        id_etapa: dto.idEtapa || null,
        canal_origen: dto.canalOrigen,
        fecha_registro: dto.fechaRegistro,
        motivo_captacion: dto.motivoCaptacion,
        recurso_interes: dto.recursoInteres || null,
        notas: dto.notas || null,
      };
      await m.query("SELECT set_config('app.admin_usuario',$1,true)",[String(user)]);
      const cols = Object.keys(fields),
        values = Object.values(fields);
      let buyerId: string;
      if (id) {
        await m.query(
          `UPDATE buyer SET ${cols.map((c, i) => `${c}=$${i + 1}`).join(',')},updated_at=now() WHERE id_buyer=$${values.length + 1}`,
          [...values, id],
        );
        buyerId = id;
      } else {
        const [row] = await m.query(
          `INSERT INTO buyer(${cols.join(',')}) VALUES(${values.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id_buyer`,
          values,
        );
        buyerId = row.id_buyer;
      }
      await m.query("UPDATE buyer SET revision=revision+1,procedencia_campos=procedencia_campos || $2::jsonb WHERE id_buyer=$1",[buyerId,JSON.stringify(Object.fromEntries(Object.keys(dto).map(k=>[k,{origen:'administracion',confirmado:true,idUsuario:user}])))]);
      const [after] = await m.query('SELECT * FROM buyer WHERE id_buyer=$1',[buyerId]);
      await m.query("INSERT INTO evento_perfil(id_buyer,tipo,origen,id_usuario,antes,despues) VALUES($1,$2,'administracion',$3,$4::jsonb,$5::jsonb)",[buyerId,before?'buyer_editado':'buyer_creado',user,JSON.stringify(before),JSON.stringify(after)]);
      if (dto.estado === 'lead') {
        if (!dto.idEstadoLead || !dto.motivoConversion?.trim())
          throw new BadRequestException(
            'Selecciona el estado del lead e indica el motivo de conversión.',
          );
        if (
          !(
            await m.query('SELECT 1 FROM estado_lead WHERE id_estado=$1', [
              dto.idEstadoLead,
            ])
          ).length
        )
          throw new BadRequestException('Estado de lead no válido.');
        await m.query(
          "SELECT set_config('app.admin_usuario',$1,true),set_config('app.admin_motivo',$2,true)",
          [String(user), `Conversión desde buyer: ${dto.motivoConversion}`],
        );
        const source = [
          'facebook',
          'instagram',
          'tiktok',
          'linkedin',
          'youtube',
        ].includes(dto.canalOrigen)
          ? 'red_social'
          : [
                'busqueda',
                'referido',
                'correo',
                'whatsapp',
                'convenio_institucional',
                'directo',
              ].includes(dto.canalOrigen)
            ? dto.canalOrigen
            : 'otro';
        const [priorSession] = await m.query(
          'SELECT id_sesion FROM solicitud_recurso WHERE id_buyer=$1 ORDER BY created_at LIMIT 1',
          [buyerId],
        );
        const [session] = priorSession
          ? [priorSession]
          : await m.query(
              'INSERT INTO sesion_landing(canal_origen,fecha,utm_source,detalle_otro_origen) VALUES($1,$2,$3,$4) RETURNING id_sesion',
              [
                source,
                dto.fechaRegistro,
                dto.canalOrigen,
                `Captación buyer #${buyerId}`,
              ],
            );
        await this.identity.releaseBuyer(m,buyerId);
        const [lead] = await m.query(
          `INSERT INTO lead(nombres,apellidos,correo,telefono,fecha_nacimiento,departamento,id_estado,id_sesion_origen,fecha_registro,reserva_pendiente) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now(),$9) RETURNING id_lead`,
          [
            dto.nombres,
            dto.apellidos || null,
            dto.correo,
            dto.telefono,
            dto.fechaNacimiento || null,
            dto.departamento || null,
            dto.idEstadoLead,
            session.id_sesion,
            !dto.correo,
          ],
        );
        await m.query(
          'INSERT INTO perfil_academico(id_lead,id_universidad,universidad_otra,id_grado,condicion) VALUES($1,$2,$3,$4,$5)',
          [
            lead.id_lead,
            dto.idUniversidad || null,
            dto.universidadOtra || null,
            dto.idGrado || null,
            dto.condicion || null,
          ],
        );
        if (dto.idEtapa)
          await m.query(
            'INSERT INTO proyecto_tesis(id_lead,id_etapa,observaciones) VALUES($1,$2,$3)',
            [lead.id_lead, dto.idEtapa, dto.notas || null],
          );
        await m.query(
          "UPDATE buyer SET estado='lead',id_lead=$1,fecha_conversion=now(),id_usuario_conversion=$2 WHERE id_buyer=$3",
          [lead.id_lead, user, buyerId],
        );
        await m.query(
          'UPDATE solicitud_recurso SET id_lead=$1 WHERE id_buyer=$2',
          [lead.id_lead, buyerId],
        );
        await this.identity.converted(m,buyerId,lead.id_lead);
        return { idBuyer: buyerId, estado: 'lead', idLead: lead.id_lead };
      }
      return this.detail(buyerId, m);
    });
  }
  async remove(id: string) {
    return this.db.transaction(async (m) => {
      const [row] = await m.query(
        'SELECT estado FROM buyer WHERE id_buyer=$1 FOR UPDATE',
        [id],
      );
      if (!row) throw new NotFoundException('Buyer no encontrado.');
      if (row.estado !== 'buyer')
        throw new ConflictException(
          'El perfil convertido se gestiona desde Leads.',
        );
      await m.query(
        'UPDATE solicitud_recurso SET nombres=NULL,telefono=NULL WHERE id_buyer=$1 AND id_lead IS NULL',
        [id],
      );
      await m.query('DELETE FROM buyer WHERE id_buyer=$1', [id]);
      return { ok: true };
    });
  }
  async capture(dto: CaptureBuyerDto, referralToken = '') {
    await this.db.transaction(async m=>{
      const owner=await this.identity.resolve(m,dto.correo,dto.telefono);
      let buyer=owner?.id_buyer||null,lead=owner?.id_lead||null;
      if(!owner){const [b]=await m.query("INSERT INTO buyer(nombres,correo,telefono,canal_origen,motivo_captacion,recurso_interes,consentimiento_at) VALUES($1,$2,$3,$4,'descarga_recurso',$5,now()) RETURNING id_buyer",[dto.nombres,dto.correo,dto.telefono,dto.canalOrigen,dto.recursoInteres]);buyer=b.id_buyer; await this.referrals.attribute(m, referralToken, b.id_buyer);}
      await m.query("INSERT INTO evento_perfil(id_buyer,id_lead,tipo,origen,despues) VALUES($1,$2,'captacion','recursos',$3::jsonb)",[buyer,lead,JSON.stringify({canal:dto.canalOrigen,recurso:dto.recursoInteres})]);
    });return {ok:true};
  }
}
