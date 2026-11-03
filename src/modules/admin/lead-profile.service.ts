import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { ContactIdentityService } from './contact-identity.service.js';
import type { LeadDto } from './admin.dto.js';
import {
  FollowUpDto,
  ProfilePageDto,
  SuggestionDecisionDto,
  HandoffUpdateDto,
  QualificationReviewDto,
} from './lead-profile.dto.js';

export const camel = (r: Record<string, any>): Record<string, any> =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      v,
    ]),
  );
const fields = {
  nombres: 'nombres',
  apellidos: 'apellidos',
  correo: 'correo',
  telefono: 'telefono',
  idEstado: 'id_estado',
  idResponsable: 'id_responsable',
  departamento: 'departamento',
  fechaNacimiento: 'fecha_nacimiento',
  canalPreferido: 'canal_preferido',
  modalidadPreferida: 'modalidad_preferida',
  horarioPreferido: 'horario_preferido',
  cumplePerfilObjetivo: 'cumple_perfil_objetivo',
  nivelInteres: 'nivel_interes',
};
export const timelineSql = `
 SELECT 'perfil:'||ep.id_evento AS referencia,ep.tipo,ep.fecha,ep.origen, jsonb_build_object('antes',ep.antes,'despues',ep.despues,'autor',nullif(concat_ws(' ',u.nombres,u.apellidos),'')) AS detalle FROM evento_perfil ep LEFT JOIN usuario_interno u ON u.id_usuario=ep.id_usuario WHERE ep.id_lead=$1
 UNION ALL SELECT 'estado:'||h.id_historial,'cambio_estado',h.fecha,'administracion',jsonb_build_object('estado',e.nombre,'motivo',h.motivo,'idUsuario',h.id_usuario) FROM lead_estado_historial h JOIN estado_lead e USING(id_estado) WHERE h.id_lead=$1
 UNION ALL SELECT 'recurso:'||ev.id_evento,ev.tipo,ev.fecha,'recursos',jsonb_build_object('titulo',s.titulo,'canal',s.canal,'campana',s.campana) FROM evento_recurso ev JOIN solicitud_recurso s USING(id_solicitud) WHERE s.id_lead=$1
 UNION ALL SELECT 'descarga:'||d.id_descarga,'descarga_historica',d.fecha,'recursos',jsonb_build_object('titulo',r.titulo,'entregado',d.entregado) FROM descarga_recurso d JOIN recurso_gratuito r USING(id_recurso) WHERE d.id_lead=$1
 AND NOT EXISTS(SELECT 1 FROM solicitud_recurso s WHERE s.id_lead=d.id_lead AND s.id_recurso=d.id_recurso AND s.id_sesion=d.id_sesion)
 UNION ALL SELECT 'mensaje:'||m.id_mensaje,'mensaje',m.enviado_en,'tesi',jsonb_build_object('idConversacion',m.id_conversacion,'remitente',m.remitente,'contenido',m.contenido) FROM mensaje m JOIN conversacion c USING(id_conversacion) WHERE c.id_lead=$1
 UNION ALL SELECT 'propuesta:'||p.id_propuesta,'propuesta_generada',p.created_at,'comercial',jsonb_build_object('idPropuesta',p.id_propuesta,'estado',p.estado,'condiciones',p.condiciones) FROM propuesta p WHERE p.id_lead=$1
 UNION ALL SELECT 'seguimiento:'||id_seguimiento,'seguimiento',coalesce(fecha_envio,fecha_programada),'administracion',jsonb_build_object('idSeguimiento',id_seguimiento,'estado',estado,'mensaje',mensaje,'resultado',resultado) FROM seguimiento WHERE id_lead=$1 AND estado<>'programado'
 UNION ALL SELECT 'reunion:'||id_reunion,'reunion_confirmada',created_at,'agenda',jsonb_build_object('fechaInicio',fecha_inicio,'estado',estado) FROM reunion WHERE id_lead=$1 AND id_solicitud IS NULL
 UNION ALL SELECT 'cancelacion:'||r.id_reunion,'reunion_cancelada',r.cancelada_at,'agenda',jsonb_build_object('motivo',r.motivo_cancelacion,'autor',nullif(concat_ws(' ',u.nombres,u.apellidos),'')) FROM reunion r LEFT JOIN usuario_interno u ON u.id_usuario=r.id_usuario_cancelacion WHERE r.id_lead=$1 AND r.id_solicitud IS NULL AND r.cancelada_at IS NOT NULL`;

@Injectable()
export class LeadProfileService {
  constructor(
    private readonly db: DataSource,
    private readonly identity: ContactIdentityService,
  ) {}
  async qualification(lead: string, conversation: string) {
    const [row] = await this.db.query('SELECT q.resultado,q.fecha FROM calificacion_tesi q JOIN conversacion c USING(id_conversacion) WHERE c.id_lead=$1 AND c.id_conversacion=$2 ORDER BY q.id_calificacion DESC LIMIT 1', [lead, conversation]);
    if (!row) throw new NotFoundException('No existe una clasificación para esta conversación.');
    return row;
  }
  async qualificationByConversation(conversation: string) {
    const [row] = await this.db.query('SELECT q.resultado,q.fecha,q.id_conversacion AS "idConversacion",q.id_lead AS "idLead",q.id_buyer AS "idBuyer" FROM calificacion_tesi q WHERE q.id_conversacion=$1 ORDER BY q.id_calificacion DESC LIMIT 1', [conversation]);
    if (!row) throw new NotFoundException('No existe una clasificación para esta conversación.');
    return row;
  }
  async reviewQualification(lead: string, evaluation: string, dto: QualificationReviewDto, user: number) {
    return this.db.transaction(async m => {
      await this.lock(m, lead, dto.revision);
      const [row] = await m.query('SELECT resultado FROM calificacion_tesi WHERE id_calificacion=$1 AND id_lead=$2', [evaluation, lead]);
      const item = row?.resultado?.[dto.grupo]?.[dto.campo];
      if (!item) throw new NotFoundException('Dato de calificación no encontrado.');
      const decision = { idCalificacion: evaluation, grupo: dto.grupo, campo: dto.campo, accion: dto.accion, valor: item.valor, evidencias: item.evidencias };
      await this.audit(m, lead, user, 'revision_calificacion', null, decision);
      await m.query('UPDATE lead SET revision=revision+1,updated_at=now() WHERE id_lead=$1', [lead]);
      return { ok: true };
    });
  }
  async handoff(lead: string, handoff: string, dto: HandoffUpdateDto, user: number) {
    return this.db.transaction(async m => {
      await this.lock(m, lead, dto.revision);
      const [before] = await m.query('SELECT * FROM derivacion_humana WHERE id_derivacion=$1 AND id_lead=$2 FOR UPDATE', [handoff, lead]);
      if (!before) throw new NotFoundException('Derivación no encontrada.');
      if (dto.idUsuarioAsignado && !(await m.query('SELECT 1 FROM usuario_interno WHERE id_usuario=$1 AND activo', [dto.idUsuarioAsignado])).length) throw new BadRequestException('El responsable no está activo.');
      const [after] = await m.query("UPDATE derivacion_humana SET estado=$3::estado_derivacion,id_usuario_asignado=$4,resolucion=$5,atendida_en=CASE WHEN $3::estado_derivacion='resuelta' THEN now() ELSE atendida_en END WHERE id_derivacion=$1 AND id_lead=$2 RETURNING *", [handoff, lead, dto.estado, dto.idUsuarioAsignado ?? null, dto.resolucion ?? null]);
      await this.audit(m, lead, user, 'derivacion', before, after);
      await m.query('UPDATE lead SET revision=revision+1,updated_at=now() WHERE id_lead=$1', [lead]);
      return camel(after);
    });
  }
  async lock(m: EntityManager, id: string, revision?: number) {
    const [row] = await m.query(
      'SELECT * FROM lead WHERE id_lead=$1 FOR UPDATE',
      [id],
    );
    if (!row) throw new NotFoundException('Lead no encontrado.');
    if (revision === undefined || row.revision !== revision)
      throw new ConflictException(
        'El perfil cambió. Recarga la ficha antes de guardar.',
      );
    return row;
  }
  async audit(
    m: EntityManager,
    id: string,
    user: number,
    tipo: string,
    antes: unknown,
    despues: unknown,
  ) {
    await m.query(
      "INSERT INTO evento_perfil(id_lead,tipo,origen,id_usuario,antes,despues) VALUES($1,$2,'administracion',$3,$4::jsonb,$5::jsonb)",
      [id, tipo, user, JSON.stringify(antes), JSON.stringify(despues)],
    );
  }
  private async snapshot(m: EntityManager, id: string) {
    const [lead] = await m.query('SELECT * FROM lead WHERE id_lead=$1', [id]);
    const [academico] = await m.query('SELECT * FROM perfil_academico WHERE id_lead=$1', [id]);
    const [laboral] = await m.query('SELECT * FROM perfil_laboral WHERE id_lead=$1', [id]);
    const proyectos = await m.query(
      `SELECT p.*,coalesce((SELECT json_agg(json_build_object('idNecesidad',n.id_necesidad,'prioridad',n.prioridad) ORDER BY n.id_necesidad) FROM proyecto_necesidad n WHERE n.id_proyecto=p.id_proyecto),'[]') AS necesidades FROM proyecto_tesis p WHERE p.id_lead=$1 ORDER BY p.id_proyecto`,
      [id],
    );
    return { lead, academico: academico || null, laboral: laboral || null, proyectos };
  }
  async save(dto: LeadDto, user: number, id?: string) {
    const leadId = await this.db.transaction(async (m) => {
      // Identity locks precede row locks consistently in every writer.
      const currentSnapshot = id
        ? (
            await m.query('SELECT correo,telefono FROM lead WHERE id_lead=$1', [
              id,
            ])
          )[0]
        : null;
      const correo =
        dto.correo === undefined ? currentSnapshot?.correo : dto.correo;
      const telefono =
        dto.telefono === undefined ? currentSnapshot?.telefono : dto.telefono;
      const owner = await this.identity.resolve(m, correo, telefono);
      if (owner && (!id || owner.id_lead !== id))
        throw new ConflictException(
          'El contacto ya existe. Gestiona o convierte su perfil actual.',
        );
      const before = id ? await this.lock(m, id, dto.revision) : null;
      const beforeProfile = id ? await this.snapshot(m, id) : null;
      if (dto.idEstado === null)
        throw new BadRequestException('El estado no puede estar vacío.');
      if (
        before &&
        dto.idEstado !== undefined &&
        dto.idEstado !== before.id_estado &&
        !dto.motivo?.trim()
      )
        throw new BadRequestException('Indica el motivo del cambio de estado.');
      if (
        dto.idResponsable &&
        !(
          await m.query(
            'SELECT 1 FROM usuario_interno WHERE id_usuario=$1 AND activo',
            [dto.idResponsable],
          )
        ).length
      )
        throw new BadRequestException('El responsable no está activo.');
      await m.query(
        "SELECT set_config('app.admin_usuario',$1,true),set_config('app.admin_motivo',$2,true)",
        [String(user), dto.motivo || 'Perfil actualizado'],
      );
      const values: unknown[] = [],
        cols: string[] = [];
      const metadata: Record<string, any> = {};
      for (const [key, col] of Object.entries(fields))
        if (Object.hasOwn(dto, key) && (dto as any)[key] !== undefined) {
          let value = (dto as any)[key];
          if (typeof value === 'string') value = value.trim() || null;
          if (key === 'cumplePerfilObjetivo' && value === null)
            throw new BadRequestException(
              'Perfil objetivo debe ser verdadero o falso.',
            );
          cols.push(col);
          values.push(value);
          metadata[key] = {
            origen: 'administracion',
            confirmado: true,
            idUsuario: user,
            fecha: new Date().toISOString(),
          };
        }
      if (!id && dto.idEstado === undefined) {
        cols.push('id_estado');
        values.push(
          (
            await m.query(
              "SELECT id_estado FROM estado_lead WHERE codigo='nuevo'",
            )
          )[0].id_estado,
        );
      }
      let saved: string;
      if (id) {
        await m.query(
          `UPDATE lead SET ${cols.map((c, i) => `${c}=$${i + 1},`).join('')}revision=revision+1,updated_at=now(),procedencia_campos=procedencia_campos || $${values.length + 1}::jsonb WHERE id_lead=$${values.length + 2}`,
          [...values, JSON.stringify(metadata), id],
        );
        saved = id;
      } else {
        const [row] = await m.query(
          `INSERT INTO lead(${cols.join(',')},procedencia_campos) VALUES(${values.map((_, i) => `$${i + 1}`).join(',')},$${values.length + 1}::jsonb) RETURNING id_lead`,
          [...values, JSON.stringify(metadata)],
        );
        saved = row.id_lead;
      }
      await this.nested(m, saved, dto, metadata, user);
      await this.audit(
        m,
        saved,
        user,
        before ? 'perfil_editado' : 'perfil_creado',
        beforeProfile,
        await this.snapshot(m, saved),
      );
      return saved;
    });
    return (
      await this.db.query('SELECT * FROM lead WHERE id_lead=$1', [leadId])
    ).map(camel)[0];
  }
  private async nested(
    m: EntityManager,
    id: string,
    dto: LeadDto,
    metadata: Record<string, any>,
    user: number,
  ) {
    const groups = [
      [
        'perfilAcademico',
        'perfil_academico',
        {
          idUniversidad: 'id_universidad',
          universidadOtra: 'universidad_otra',
          idFacultad: 'id_facultad',
          idPrograma: 'id_programa',
          idGrado: 'id_grado',
          ciclo: 'ciclo',
          condicion: 'condicion',
          anioEgreso: 'anio_egreso',
        },
      ],
      [
        'perfilLaboral',
        'perfil_laboral',
        {
          trabaja: 'trabaja',
          ocupacion: 'ocupacion',
          horasLibresSemana: 'horas_libres_semana',
        },
      ],
    ] as const;
    for (const [key, table, mapping] of groups) {
      const data = dto[key];
      if (data === undefined) continue;
      if (data === null)
        throw new BadRequestException(
          'Envía los campos del perfil que deseas modificar.',
        );
      const entries = Object.entries(mapping).filter(
        ([k]) => Object.hasOwn(data, k) && (data as any)[k] !== undefined,
      );
      if (!entries.length) continue;
      const values = entries.map(([k]) => (data as any)[k]);
      await m.query(
        `INSERT INTO ${table}(id_lead,${entries.map(([, v]) => v).join(',')}) VALUES($1,${values.map((_, i) => `$${i + 2}`).join(',')}) ON CONFLICT(id_lead) DO UPDATE SET ${entries.map(([, v]) => `${v}=excluded.${v}`).join(',')}`,
        [id, ...values],
      );
      if (key === 'perfilAcademico') {
        const [p] = await m.query(
          'SELECT * FROM perfil_academico WHERE id_lead=$1',
          [id],
        );
        if (p.id_universidad && p.universidad_otra)
          throw new BadRequestException(
            'Indica universidad de catálogo u otra, no ambas.',
          );
        if (
          p.id_programa &&
          !(
            await m.query(
              'SELECT 1 FROM programa_academico WHERE id_programa=$1 AND ($2::int IS NULL OR id_grado=$2)',
              [p.id_programa, p.id_grado],
            )
          ).length
        )
          throw new BadRequestException('El programa no corresponde al grado.');
      }
      for (const [k] of entries)
        metadata[`${key}.${k}`] = {
          origen: 'administracion',
          confirmado: true,
          idUsuario: user,
          fecha: new Date().toISOString(),
        };
    }
    for (const project of dto.proyectos || []) {
      const mapping = {
        tema: 'tema',
        idEtapa: 'id_etapa',
        idServicioInteres: 'id_servicio_interes',
        fechaLimite: 'fecha_limite',
        observaciones: 'observaciones',
      };
      const entries = Object.entries(mapping).filter(
        ([k]) => Object.hasOwn(project, k) && (project as any)[k] !== undefined,
      );
      let projectId = project.idProyecto;
      if (projectId) {
        if (
          !(
            await m.query(
              'SELECT 1 FROM proyecto_tesis WHERE id_proyecto=$1 AND id_lead=$2 FOR UPDATE',
              [projectId, id],
            )
          ).length
        )
          throw new BadRequestException('Proyecto ajeno al lead.');
        if (entries.length)
          await m.query(
            `UPDATE proyecto_tesis SET ${entries.map(([, v], i) => `${v}=$${i + 1}`).join(',')},updated_at=now() WHERE id_proyecto=$${entries.length + 1}`,
            [...entries.map(([k]) => (project as any)[k]), projectId],
          );
      } else {
        const [p] = await m.query(
          `INSERT INTO proyecto_tesis(id_lead${entries.map(([, v]) => ',' + v).join('')}) VALUES($1${entries.map((_, i) => `,$${i + 2}`).join('')}) RETURNING id_proyecto`,
          [id, ...entries.map(([k]) => (project as any)[k])],
        );
        projectId = p.id_proyecto;
      }
      if (project.necesidades !== undefined) {
        await m.query('DELETE FROM proyecto_necesidad WHERE id_proyecto=$1', [
          projectId,
        ]);
        for (const need of new Set(project.necesidades))
          await m.query(
            'INSERT INTO proyecto_necesidad(id_proyecto,id_necesidad) VALUES($1,$2)',
            [projectId, need],
          );
      }
      metadata[`proyecto.${projectId}`] = {
        origen: 'administracion',
        confirmado: true,
        idUsuario: user,
        fecha: new Date().toISOString(),
      };
    }
    await m.query(
      'UPDATE lead SET procedencia_campos=procedencia_campos || $2::jsonb WHERE id_lead=$1',
      [id, JSON.stringify(metadata)],
    );
  }
  async catalogos() {
    const result: Record<string, any> = {};
    for (const [key, sql] of Object.entries({
      universidades:
        'SELECT id_universidad,nombre FROM universidad ORDER BY nombre',
      grados: 'SELECT id_grado,nombre FROM grado_academico ORDER BY id_grado',
      programas: 'SELECT * FROM programa_academico ORDER BY nombre',
      facultades: 'SELECT * FROM facultad ORDER BY nombre',
      etapas: 'SELECT id_etapa,id_grado,nombre FROM etapa_tesis ORDER BY orden',
      necesidades: 'SELECT * FROM necesidad_academica ORDER BY nombre',
      servicios:
        'SELECT id_servicio,nombre FROM servicio WHERE activo ORDER BY nombre',
    }))
      result[key] = (await this.db.query(sql)).map(camel);
    return result;
  }
  async enrich(id: string) {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const query = async (sql: string) =>
        (await m.query(sql, [id])).map(camel);
      const laboral = await query(
        'SELECT * FROM perfil_laboral WHERE id_lead=$1',
      );
      const proyectos = await query(
        `SELECT p.*,e.nombre AS etapa_nombre,s.nombre AS servicio_nombre,coalesce((SELECT json_agg(json_build_object('idNecesidad',n.id_necesidad,'nombre',n.nombre,'prioridad',pn.prioridad)) FROM proyecto_necesidad pn JOIN necesidad_academica n USING(id_necesidad) WHERE pn.id_proyecto=p.id_proyecto),'[]') AS necesidades FROM proyecto_tesis p LEFT JOIN etapa_tesis e USING(id_etapa) LEFT JOIN servicio s ON s.id_servicio=p.id_servicio_interes WHERE p.id_lead=$1 ORDER BY p.id_proyecto`,
      );
      const captacion = await query(
        `SELECT s.*,c.nombre AS campana_nombre FROM sesion_landing s LEFT JOIN campana c USING(id_campana) WHERE s.id_sesion=(SELECT id_sesion_origen FROM lead WHERE id_lead=$1)`,
      );
      const propuestas = await query(
        `SELECT p.*,(SELECT json_agg(json_build_object('servicio',s.nombre,'descripcion',d.descripcion)) FROM propuesta_detalle d JOIN servicio s USING(id_servicio) WHERE d.id_propuesta=p.id_propuesta) AS detalles FROM propuesta p WHERE id_lead=$1 ORDER BY created_at DESC`,
      );
      const reuniones = await query(
        'SELECT * FROM reunion WHERE id_lead=$1 ORDER BY fecha_inicio DESC',
      );
      const seguimientos = await query(
        `SELECT s.*,concat_ws(' ',u.nombres,u.apellidos) AS autor FROM seguimiento s LEFT JOIN usuario_interno u USING(id_usuario) WHERE s.id_lead=$1 ORDER BY fecha_programada DESC`,
      );
      const conversaciones = await query(
        `SELECT c.*,n.nombre AS necesidad_nombre,(SELECT count(*)::int FROM mensaje WHERE id_conversacion=c.id_conversacion) AS total_mensajes FROM conversacion c LEFT JOIN necesidad_academica n USING(id_necesidad) WHERE c.id_lead=$1 ORDER BY iniciada_en DESC`,
      );
      const sugerencias = await query(
        'SELECT * FROM sugerencia_perfil WHERE id_lead=$1 ORDER BY fecha DESC',
      );
      const calificaciones = await query(`SELECT c.*,coalesce((SELECT json_agg(json_build_object('grupo',e.despues->>'grupo','campo',e.despues->>'campo','accion',e.despues->>'accion','fecha',e.fecha,'autor',concat_ws(' ',u.nombres,u.apellidos)) ORDER BY e.fecha DESC,e.id_evento DESC) FROM evento_perfil e LEFT JOIN usuario_interno u ON u.id_usuario=e.id_usuario WHERE e.id_lead=c.id_lead AND e.tipo='revision_calificacion' AND e.despues->>'idCalificacion'=c.id_calificacion::text),'[]') AS revisiones FROM calificacion_tesi c WHERE c.id_lead=$1 ORDER BY c.id_calificacion DESC`);
      const derivaciones = await query('SELECT * FROM derivacion_humana WHERE id_lead=$1 ORDER BY derivada_en DESC');
      const [last] = await m.query(
        `SELECT max(fecha) AS fecha FROM (${timelineSql}) t WHERE fecha<=now()`,
        [id],
      );
      const [next] = await m.query(
        `SELECT fecha,tipo FROM (SELECT fecha_programada AS fecha,'seguimiento' AS tipo FROM seguimiento WHERE id_lead=$1 AND estado='programado' UNION ALL SELECT fecha_inicio,'reunion' FROM reunion WHERE id_lead=$1 AND estado='confirmada' AND fecha_inicio>now()) t ORDER BY fecha LIMIT 1`,
        [id],
      );
      return {
        perfilLaboral: laboral[0] || null,
        proyectos,
        captacion: captacion[0] || null,
        propuestas,
        reuniones,
        seguimientos,
        conversaciones,
        sugerencias,
        calificaciones,
        derivaciones,
        ultimaInteraccion: last?.fecha || null,
        proximaAccion: next || null,
      };
    });
  }
  async interactions(id: string, dto: ProfilePageDto) {
    if (
      !(await this.db.query('SELECT 1 FROM lead WHERE id_lead=$1', [id])).length
    )
      throw new NotFoundException('Lead no encontrado.');
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const [{ total }] = await m.query(
        `SELECT count(*)::int AS total FROM (${timelineSql}) t`,
        [id],
      );
      const items = await m.query(
        `SELECT * FROM (${timelineSql}) t ORDER BY fecha DESC,referencia DESC LIMIT $2 OFFSET $3`,
        [id, dto.pageSize, (dto.page - 1) * dto.pageSize],
      );
      return { items, total, page: dto.page, pageSize: dto.pageSize };
    });
  }
  async messages(id: string, conversation: string, dto: ProfilePageDto) {
    if (
      !(
        await this.db.query(
          'SELECT 1 FROM conversacion WHERE id_lead=$1 AND id_conversacion=$2',
          [id, conversation],
        )
      ).length
    )
      throw new NotFoundException('Conversación no encontrada.');
    const [{ total }] = await this.db.query(
      'SELECT count(*)::int AS total FROM mensaje WHERE id_conversacion=$1',
      [conversation],
    );
    const items = (
      await this.db.query(
        'SELECT * FROM mensaje WHERE id_conversacion=$1 ORDER BY enviado_en,id_mensaje LIMIT $2 OFFSET $3',
        [conversation, dto.pageSize, (dto.page - 1) * dto.pageSize],
      )
    ).map(camel);
    return { items, total, page: dto.page, pageSize: dto.pageSize };
  }
  async followUp(
    id: string,
    dto: FollowUpDto,
    user: number,
    followId?: string,
  ) {
    return this.db.transaction(async (m) => {
      await this.lock(m, id, dto.revision);
      if (
        dto.idPropuesta &&
        !(
          await m.query(
            'SELECT 1 FROM propuesta WHERE id_propuesta=$1 AND id_lead=$2',
            [dto.idPropuesta, id],
          )
        ).length
      )
        throw new BadRequestException('Propuesta ajena al lead.');
      let before = null;
      if (followId) {
        [before] = await m.query(
          'SELECT * FROM seguimiento WHERE id_seguimiento=$1 AND id_lead=$2 FOR UPDATE',
          [followId, id],
        );
        if (!before) throw new NotFoundException('Seguimiento no encontrado.');
      }
      const args = [
        dto.idPropuesta || null,
        dto.canal || null,
        dto.estado || 'programado',
        dto.fechaProgramada,
        dto.mensaje || null,
        dto.resultado || null,
        user,
        id,
      ];
      const [row] = await m.query(
        followId
          ? `UPDATE seguimiento SET id_propuesta=$1,canal=$2,estado=$3,fecha_programada=$4,mensaje=$5,resultado=$6,id_usuario=$7,fecha_envio=CASE WHEN $3::estado_seguimiento='programado' THEN NULL ELSE coalesce(fecha_envio,now()) END WHERE id_lead=$8 AND id_seguimiento=$9 RETURNING *`
          : `INSERT INTO seguimiento(id_propuesta,canal,estado,fecha_programada,mensaje,resultado,id_usuario,id_lead,generado_por_ia,fecha_envio) VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,CASE WHEN $3::estado_seguimiento='programado' THEN NULL ELSE now() END) RETURNING *`,
        followId ? [...args, followId] : args,
      );
      await m.query(
        'UPDATE lead SET revision=revision+1,updated_at=now() WHERE id_lead=$1',
        [id],
      );
      await this.audit(
        m,
        id,
        user,
        followId ? 'seguimiento_editado' : 'seguimiento_creado',
        before,
        row,
      );
      return camel(row);
    });
  }
  async decide(
    id: string,
    suggestion: string,
    dto: SuggestionDecisionDto,
    user: number,
  ) {
    return this.db.transaction(async (m) => {
      await this.lock(m, id, dto.revision);
      const beforeProfile = await this.snapshot(m, id);
      const [s] = await m.query(
        'SELECT * FROM sugerencia_perfil WHERE id_sugerencia=$1 AND id_lead=$2 FOR UPDATE',
        [suggestion, id],
      );
      if (!s) throw new NotFoundException('Sugerencia no encontrada.');
      if (s.estado !== 'pendiente')
        throw new ConflictException('La sugerencia ya fue revisada.');
      const patch: LeadDto = {};
      if (dto.accion === 'aceptar') {
        if (s.campo === 'name') patch.nombres = s.valor;
        else if (s.campo === 'university')
          patch.perfilAcademico = {
            universidadOtra: s.valor,
            idUniversidad: null,
          };
        else if (s.campo === 'degree') {
          if (!dto.idCatalogo)
            throw new BadRequestException('Selecciona el grado de catálogo.');
          patch.perfilAcademico = { idGrado: dto.idCatalogo };
        } else if (
          ['thesisStage', 'need', 'service', 'deadline'].includes(s.campo)
        ) {
          if (!dto.idProyecto)
            throw new BadRequestException(
              'Selecciona el proyecto al que aplicar la sugerencia.',
            );
          const project: any = { idProyecto: dto.idProyecto };
          if (s.campo === 'thesisStage') {
            if (!dto.idCatalogo)
              throw new BadRequestException('Selecciona una etapa.');
            project.idEtapa = dto.idCatalogo;
          }
          if (s.campo === 'service') {
            if (!dto.idCatalogo)
              throw new BadRequestException('Selecciona un servicio.');
            project.idServicioInteres = dto.idCatalogo;
          }
          if (s.campo === 'need') {
            if (!dto.idCatalogo)
              throw new BadRequestException('Selecciona una necesidad.');
            const rows = await m.query(
              'SELECT id_necesidad FROM proyecto_necesidad WHERE id_proyecto=$1',
              [dto.idProyecto],
            );
            project.necesidades = [
              ...rows.map((r: any) => r.id_necesidad),
              dto.idCatalogo,
            ];
          }
          if (s.campo === 'deadline')
            throw new BadRequestException(
              'El plazo de texto requiere una fecha explícita. Regístrala en el proyecto y rechaza la sugerencia.',
            );
          patch.proyectos = [project];
        }
        // Intent and objections are retained as reviewed context, never a numeric interest score.
        const metadata: Record<string, any> = {};
        if (patch.nombres !== undefined) {
          await m.query('UPDATE lead SET nombres=$2 WHERE id_lead=$1', [
            id,
            patch.nombres,
          ]);
          metadata.nombres = {
            confirmado: true,
            origen: 'administracion',
            idUsuario: user,
          };
        }
        await this.nested(m, id, patch, metadata, user);
      }
      await m.query(
        'UPDATE sugerencia_perfil SET estado=$2,id_usuario=$3,resuelta_at=now() WHERE id_sugerencia=$1',
        [suggestion, dto.accion === 'aceptar' ? 'aceptada' : 'rechazada', user],
      );
      await m.query(
        'UPDATE lead SET revision=revision+1,updated_at=now() WHERE id_lead=$1',
        [id],
      );
      await this.audit(m, id, user, 'sugerencia_revisada', { sugerencia: s, perfil: beforeProfile }, {
        accion: dto.accion,
        aplicado: patch,
        perfil: await this.snapshot(m, id),
      });
      return { ok: true };
    });
  }
}
