import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entitiesDir = join(__dirname, '..', 'src', 'entities');

const entities = {
  'universidad.entity.ts': `import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Facultad } from './facultad.entity.js';

@Entity('universidad')
export class Universidad {
  @PrimaryGeneratedColumn({ name: 'id_universidad' })
  idUniversidad: number;

  @Column({ type: 'varchar', length: 200, unique: true })
  nombre: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  siglas: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  tipoGestion: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  departamento: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ciudad: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  sitioWeb: string | null;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => Facultad, (facultad) => facultad.universidad)
  facultades: Facultad[];
}
`,

  'grado-academico.entity.ts': `import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ModeloCobro } from '../common/enums/database.enums.js';

@Entity('grado_academico')
export class GradoAcademico {
  @PrimaryGeneratedColumn({ name: 'id_grado', type: 'smallint' })
  idGrado: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 60 })
  nombre: string;

  @Column({ name: 'modelo_cobro_sugerido', type: 'enum', enum: ModeloCobro, enumName: 'modelo_cobro', nullable: true })
  modeloCobroSugerido: ModeloCobro | null;

  @Column({ name: 'requiere_perfil_investigador', type: 'boolean', default: false })
  requierePerfilInvestigador: boolean;
}
`,

  'facultad.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Universidad } from './universidad.entity.js';
import { ProgramaAcademico } from './programa-academico.entity.js';

@Entity('facultad')
export class Facultad {
  @PrimaryGeneratedColumn({ name: 'id_facultad' })
  idFacultad: number;

  @Column({ name: 'id_universidad' })
  idUniversidad: number;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @ManyToOne(() => Universidad, (universidad) => universidad.facultades)
  @JoinColumn({ name: 'id_universidad' })
  universidad: Universidad;

  @OneToMany(() => ProgramaAcademico, (programa) => programa.facultad)
  programas: ProgramaAcademico[];
}
`,

  'programa-academico.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Facultad } from './facultad.entity.js';
import { GradoAcademico } from './grado-academico.entity.js';

@Entity('programa_academico')
export class ProgramaAcademico {
  @PrimaryGeneratedColumn({ name: 'id_programa' })
  idPrograma: number;

  @Column({ name: 'id_facultad' })
  idFacultad: number;

  @Column({ name: 'id_grado', type: 'smallint' })
  idGrado: number;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @ManyToOne(() => Facultad, (facultad) => facultad.programas)
  @JoinColumn({ name: 'id_facultad' })
  facultad: Facultad;

  @ManyToOne(() => GradoAcademico)
  @JoinColumn({ name: 'id_grado' })
  grado: GradoAcademico;
}
`,

  'directiva-tesis.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Facultad } from './facultad.entity.js';
import { GradoAcademico } from './grado-academico.entity.js';

@Entity('directiva_tesis')
export class DirectivaTesis {
  @PrimaryGeneratedColumn({ name: 'id_directiva' })
  idDirectiva: number;

  @Column({ name: 'id_facultad' })
  idFacultad: number;

  @Column({ name: 'id_grado', type: 'smallint' })
  idGrado: number;

  @Column({ type: 'varchar', length: 20, default: '1.0' })
  version: string;

  @Column({ name: 'estructura_tesis', type: 'jsonb', nullable: true })
  estructuraTesis: Record<string, unknown> | null;

  @Column({ name: 'formato_caratula_url', type: 'text', nullable: true })
  formatoCaratulaUrl: string | null;

  @Column({ name: 'esquema_documentario', type: 'jsonb', nullable: true })
  esquemaDocumentario: Record<string, unknown> | null;

  @Column({ name: 'umbral_similitud_pct', type: 'decimal', precision: 5, scale: 2, nullable: true })
  umbralSimilitudPct: string | null;

  @Column({ name: 'exige_deteccion_ia', type: 'boolean', default: false })
  exigeDeteccionIa: boolean;

  @Column({ name: 'documento_url', type: 'text', nullable: true })
  documentoUrl: string | null;

  @Column({ name: 'vigente_desde', type: 'date', nullable: true })
  vigenteDesde: string | null;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  vigenteHasta: string | null;

  @Column({ type: 'boolean', default: true })
  vigente: boolean;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @ManyToOne(() => Facultad)
  @JoinColumn({ name: 'id_facultad' })
  facultad: Facultad;

  @ManyToOne(() => GradoAcademico)
  @JoinColumn({ name: 'id_grado' })
  grado: GradoAcademico;
}
`,

  'etapa-tesis.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { GradoAcademico } from './grado-academico.entity.js';

@Entity('etapa_tesis')
export class EtapaTesis {
  @PrimaryGeneratedColumn({ name: 'id_etapa' })
  idEtapa: number;

  @Column({ name: 'id_grado', type: 'smallint', nullable: true })
  idGrado: number | null;

  @Column({ type: 'varchar', length: 80 })
  nombre: string;

  @Column({ type: 'smallint' })
  orden: number;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @ManyToOne(() => GradoAcademico, { nullable: true })
  @JoinColumn({ name: 'id_grado' })
  grado: GradoAcademico | null;
}
`,

  'necesidad-academica.entity.ts': `import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('necesidad_academica')
export class NecesidadAcademica {
  @PrimaryGeneratedColumn({ name: 'id_necesidad' })
  idNecesidad: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;
}
`,

  'usuario-interno.entity.ts': `import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { RolUsuario } from '../common/enums/database.enums.js';

@Entity('usuario_interno')
export class UsuarioInterno {
  @PrimaryGeneratedColumn({ name: 'id_usuario' })
  idUsuario: number;

  @Column({ type: 'varchar', length: 100 })
  nombres: string;

  @Column({ type: 'varchar', length: 100 })
  apellidos: string;

  @Column({ type: 'varchar', length: 150, unique: true })
  correo: string;

  @Column({ type: 'enum', enum: RolUsuario, enumName: 'rol_usuario' })
  rol: RolUsuario;

  @Column({ name: 'perfil_investigador', type: 'boolean', default: false })
  perfilInvestigador: boolean;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
`,

  'agente-ia.entity.ts': `import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TipoAgente } from '../common/enums/database.enums.js';

@Entity('agente_ia')
export class AgenteIa {
  @PrimaryGeneratedColumn({ name: 'id_agente' })
  idAgente: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  nombre: string;

  @Column({ type: 'enum', enum: TipoAgente, enumName: 'tipo_agente' })
  tipo: TipoAgente;

  @Column({ type: 'varchar', length: 80, nullable: true })
  modelo: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  version: string | null;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
`,

  'plataforma.entity.ts': `import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { CuentaRedSocial } from './cuenta-red-social.entity.js';

@Entity('plataforma')
export class Plataforma {
  @PrimaryGeneratedColumn({ name: 'id_plataforma' })
  idPlataforma: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  nombre: string;

  @OneToMany(() => CuentaRedSocial, (cuenta) => cuenta.plataforma)
  cuentas: CuentaRedSocial[];
}
`,

  'cuenta-red-social.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Plataforma } from './plataforma.entity.js';
import { Publicacion } from './publicacion.entity.js';

@Entity('cuenta_red_social')
export class CuentaRedSocial {
  @PrimaryGeneratedColumn({ name: 'id_cuenta' })
  idCuenta: number;

  @Column({ name: 'id_plataforma' })
  idPlataforma: number;

  @Column({ name: 'nombre_usuario', type: 'varchar', length: 100 })
  nombreUsuario: string;

  @Column({ type: 'varchar', length: 250, nullable: true })
  url: string | null;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @ManyToOne(() => Plataforma, (plataforma) => plataforma.cuentas)
  @JoinColumn({ name: 'id_plataforma' })
  plataforma: Plataforma;

  @OneToMany(() => Publicacion, (publicacion) => publicacion.cuenta)
  publicaciones: Publicacion[];
}
`,

  'campana.entity.ts': `import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('campana')
export class Campana {
  @PrimaryGeneratedColumn({ name: 'id_campana' })
  idCampana: number;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  objetivo: string | null;

  @Column({ name: 'fecha_inicio', type: 'date', nullable: true })
  fechaInicio: string | null;

  @Column({ name: 'fecha_fin', type: 'date', nullable: true })
  fechaFin: string | null;

  @Column({ name: 'utm_campaign', type: 'varchar', length: 100, unique: true, nullable: true })
  utmCampaign: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  presupuesto: string | null;

  @Column({ type: 'boolean', default: true })
  activa: boolean;
}
`,

  'concepto-visual.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TipoConceptoVisual } from '../common/enums/database.enums.js';
import { AgenteIa } from './agente-ia.entity.js';
import { UsuarioInterno } from './usuario-interno.entity.js';

@Entity('concepto_visual')
export class ConceptoVisual {
  @PrimaryGeneratedColumn({ name: 'id_concepto' })
  idConcepto: number;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @Column({ type: 'enum', enum: TipoConceptoVisual, enumName: 'tipo_concepto_visual' })
  tipo: TipoConceptoVisual;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'jsonb', nullable: true })
  valor: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  aprobado: boolean;

  @Column({ name: 'aprobado_por', nullable: true })
  aprobadoPor: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: AgenteIa | null;

  @ManyToOne(() => UsuarioInterno, { nullable: true })
  @JoinColumn({ name: 'aprobado_por' })
  aprobador: UsuarioInterno | null;
}
`,

  'publicacion.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoPublicacion, TipoContenido } from '../common/enums/database.enums.js';
import { CuentaRedSocial } from './cuenta-red-social.entity.js';
import { Campana } from './campana.entity.js';
import { ConceptoVisual } from './concepto-visual.entity.js';
import { AgenteIa } from './agente-ia.entity.js';

@Entity('publicacion')
export class Publicacion {
  @PrimaryGeneratedColumn({ name: 'id_publicacion' })
  idPublicacion: number;

  @Column({ name: 'id_cuenta' })
  idCuenta: number;

  @Column({ name: 'id_campana', nullable: true })
  idCampana: number | null;

  @Column({ name: 'id_concepto', nullable: true })
  idConcepto: number | null;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @Column({ name: 'tipo_contenido', type: 'enum', enum: TipoContenido, enumName: 'tipo_contenido' })
  tipoContenido: TipoContenido;

  @Column({ type: 'varchar', length: 200, nullable: true })
  titulo: string | null;

  @Column({ type: 'text', nullable: true })
  texto: string | null;

  @Column({ name: 'llamado_accion', type: 'varchar', length: 200, nullable: true })
  llamadoAccion: string | null;

  @Column({ type: 'enum', enum: EstadoPublicacion, enumName: 'estado_publicacion', default: EstadoPublicacion.IDEA })
  estado: EstadoPublicacion;

  @Column({ name: 'fecha_programada', type: 'timestamptz', nullable: true })
  fechaProgramada: Date | null;

  @Column({ name: 'fecha_publicacion', type: 'timestamptz', nullable: true })
  fechaPublicacion: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  url: string | null;

  @Column({ type: 'int', default: 0 })
  impresiones: number;

  @Column({ type: 'int', default: 0 })
  alcance: number;

  @Column({ type: 'int', default: 0 })
  likes: number;

  @Column({ type: 'int', default: 0 })
  comentarios: number;

  @Column({ type: 'int', default: 0 })
  compartidos: number;

  @Column({ type: 'int', default: 0 })
  clics: number;

  @Column({ name: 'generada_por_ia', type: 'boolean', default: false })
  generadaPorIa: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => CuentaRedSocial, (cuenta) => cuenta.publicaciones)
  @JoinColumn({ name: 'id_cuenta' })
  cuenta: CuentaRedSocial;

  @ManyToOne(() => Campana, { nullable: true })
  @JoinColumn({ name: 'id_campana' })
  campana: Campana | null;

  @ManyToOne(() => ConceptoVisual, { nullable: true })
  @JoinColumn({ name: 'id_concepto' })
  concepto: ConceptoVisual | null;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: AgenteIa | null;
}
`,

  'convenio-institucional.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Universidad } from './universidad.entity.js';

@Entity('convenio_institucional')
export class ConvenioInstitucional {
  @PrimaryGeneratedColumn({ name: 'id_convenio' })
  idConvenio: number;

  @Column({ name: 'id_universidad', nullable: true })
  idUniversidad: number | null;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ name: 'fecha_inicio', type: 'date', nullable: true })
  fechaInicio: string | null;

  @Column({ name: 'fecha_fin', type: 'date', nullable: true })
  fechaFin: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ManyToOne(() => Universidad, { nullable: true })
  @JoinColumn({ name: 'id_universidad' })
  universidad: Universidad | null;
}
`,

  'recurso-gratuito.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EtapaTesis } from './etapa-tesis.entity.js';
import { GradoAcademico } from './grado-academico.entity.js';

@Entity('recurso_gratuito')
export class RecursoGratuito {
  @PrimaryGeneratedColumn({ name: 'id_recurso' })
  idRecurso: number;

  @Column({ type: 'varchar', length: 200 })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  tipo: string | null;

  @Column({ name: 'archivo_url', type: 'text' })
  archivoUrl: string;

  @Column({ name: 'id_etapa', nullable: true })
  idEtapa: number | null;

  @Column({ name: 'id_grado', type: 'smallint', nullable: true })
  idGrado: number | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ManyToOne(() => EtapaTesis, { nullable: true })
  @JoinColumn({ name: 'id_etapa' })
  etapa: EtapaTesis | null;

  @ManyToOne(() => GradoAcademico, { nullable: true })
  @JoinColumn({ name: 'id_grado' })
  grado: GradoAcademico | null;
}
`,

  'sesion-landing.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CanalOrigenSesion } from '../common/enums/database.enums.js';
import { Publicacion } from './publicacion.entity.js';
import { Campana } from './campana.entity.js';
import { EnlaceReferido } from './enlace-referido.entity.js';
import { ConvenioInstitucional } from './convenio-institucional.entity.js';
import { RecursoGratuito } from './recurso-gratuito.entity.js';

@Entity('sesion_landing')
export class SesionLanding {
  @PrimaryGeneratedColumn({ name: 'id_sesion', type: 'bigint' })
  idSesion: string;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha: Date;

  @Column({ name: 'canal_origen', type: 'enum', enum: CanalOrigenSesion, enumName: 'canal_origen_sesion', default: CanalOrigenSesion.DIRECTO })
  canalOrigen: CanalOrigenSesion;

  @Column({ name: 'id_publicacion', nullable: true })
  idPublicacion: number | null;

  @Column({ name: 'id_campana', nullable: true })
  idCampana: number | null;

  @Column({ name: 'id_referido', nullable: true })
  idReferido: number | null;

  @Column({ name: 'id_convenio', nullable: true })
  idConvenio: number | null;

  @Column({ name: 'id_recurso', nullable: true })
  idRecurso: number | null;

  @Column({ name: 'detalle_otro_origen', type: 'varchar', length: 200, nullable: true })
  detalleOtroOrigen: string | null;

  @Column({ name: 'utm_source', type: 'varchar', length: 100, nullable: true })
  utmSource: string | null;

  @Column({ name: 'utm_medium', type: 'varchar', length: 100, nullable: true })
  utmMedium: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  dispositivo: string | null;

  @Column({ name: 'tuvo_interaccion', type: 'boolean', default: false })
  tuvoInteraccion: boolean;

  @Column({ name: 'visito_formulario', type: 'boolean', default: false })
  visitoFormulario: boolean;

  @Column({ name: 'completo_formulario', type: 'boolean', default: false })
  completoFormulario: boolean;

  @ManyToOne(() => Publicacion, { nullable: true })
  @JoinColumn({ name: 'id_publicacion' })
  publicacion: Publicacion | null;

  @ManyToOne(() => Campana, { nullable: true })
  @JoinColumn({ name: 'id_campana' })
  campana: Campana | null;

  @ManyToOne(() => EnlaceReferido, { nullable: true })
  @JoinColumn({ name: 'id_referido' })
  referido: EnlaceReferido | null;

  @ManyToOne(() => ConvenioInstitucional, { nullable: true })
  @JoinColumn({ name: 'id_convenio' })
  convenio: ConvenioInstitucional | null;

  @ManyToOne(() => RecursoGratuito, { nullable: true })
  @JoinColumn({ name: 'id_recurso' })
  recurso: RecursoGratuito | null;
}
`,

  'estado-lead.entity.ts': `import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('estado_lead')
export class EstadoLead {
  @PrimaryGeneratedColumn({ name: 'id_estado', type: 'smallint' })
  idEstado: number;

  @Column({ type: 'varchar', length: 30, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 60 })
  nombre: string;

  @Column({ type: 'smallint' })
  fase: number;

  @Column({ type: 'smallint' })
  orden: number;
}
`,

  'lead.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CanalContacto, ModalidadServicio } from '../common/enums/database.enums.js';
import { SesionLanding } from './sesion-landing.entity.js';
import { EstadoLead } from './estado-lead.entity.js';
import { UsuarioInterno } from './usuario-interno.entity.js';

@Entity('lead')
export class Lead {
  @PrimaryGeneratedColumn({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'id_sesion_origen', type: 'bigint', nullable: true })
  idSesionOrigen: string | null;

  @Column({ name: 'id_estado', type: 'smallint' })
  idEstado: number;

  @Column({ name: 'id_responsable', nullable: true })
  idResponsable: number | null;

  @Column({ type: 'varchar', length: 100 })
  nombres: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  apellidos: string | null;

  @Column({ type: 'varchar', length: 150, unique: true })
  correo: string;

  @Column({ type: 'varchar', length: 20 })
  telefono: string;

  @Column({ name: 'fecha_nacimiento', type: 'date', nullable: true })
  fechaNacimiento: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  departamento: string | null;

  @Column({ name: 'canal_preferido', type: 'enum', enum: CanalContacto, enumName: 'canal_contacto', nullable: true })
  canalPreferido: CanalContacto | null;

  @Column({ name: 'horario_preferido', type: 'varchar', length: 80, nullable: true })
  horarioPreferido: string | null;

  @Column({ name: 'modalidad_preferida', type: 'enum', enum: ModalidadServicio, enumName: 'modalidad_servicio', nullable: true })
  modalidadPreferida: ModalidadServicio | null;

  @Column({ name: 'cumple_perfil_objetivo', type: 'boolean', default: false })
  cumplePerfilObjetivo: boolean;

  @Column({ name: 'nivel_interes', type: 'smallint', nullable: true })
  nivelInteres: number | null;

  @CreateDateColumn({ name: 'fecha_registro', type: 'timestamptz' })
  fechaRegistro: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => SesionLanding, { nullable: true })
  @JoinColumn({ name: 'id_sesion_origen' })
  sesionOrigen: SesionLanding | null;

  @ManyToOne(() => EstadoLead)
  @JoinColumn({ name: 'id_estado' })
  estado: EstadoLead;

  @ManyToOne(() => UsuarioInterno, { nullable: true })
  @JoinColumn({ name: 'id_responsable' })
  responsable: UsuarioInterno | null;
}
`,

  'enlace-referido.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Lead } from './lead.entity.js';

@Entity('enlace_referido')
export class EnlaceReferido {
  @PrimaryGeneratedColumn({ name: 'id_referido' })
  idReferido: number;

  @Column({ name: 'id_lead_referente', type: 'bigint' })
  idLeadReferente: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  codigo: string;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead_referente' })
  leadReferente: Lead;
}
`,

  'lead-estado-historial.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Lead } from './lead.entity.js';
import { EstadoLead } from './estado-lead.entity.js';
import { UsuarioInterno } from './usuario-interno.entity.js';
import { AgenteIa } from './agente-ia.entity.js';

@Entity('lead_estado_historial')
export class LeadEstadoHistorial {
  @PrimaryGeneratedColumn({ name: 'id_historial', type: 'bigint' })
  idHistorial: string;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'id_estado', type: 'smallint' })
  idEstado: number;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha: Date;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  @Column({ name: 'id_usuario', nullable: true })
  idUsuario: number | null;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Lead;

  @ManyToOne(() => EstadoLead)
  @JoinColumn({ name: 'id_estado' })
  estado: EstadoLead;

  @ManyToOne(() => UsuarioInterno, { nullable: true })
  @JoinColumn({ name: 'id_usuario' })
  usuario: UsuarioInterno | null;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: AgenteIa | null;
}
`,

  'perfil-academico.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CondicionAcademica } from '../common/enums/database.enums.js';
import { Lead } from './lead.entity.js';
import { Universidad } from './universidad.entity.js';
import { Facultad } from './facultad.entity.js';
import { ProgramaAcademico } from './programa-academico.entity.js';
import { GradoAcademico } from './grado-academico.entity.js';

@Entity('perfil_academico')
export class PerfilAcademico {
  @PrimaryGeneratedColumn({ name: 'id_perfil' })
  idPerfil: number;

  @Column({ name: 'id_lead', type: 'bigint', unique: true })
  idLead: string;

  @Column({ name: 'id_universidad', nullable: true })
  idUniversidad: number | null;

  @Column({ name: 'id_facultad', nullable: true })
  idFacultad: number | null;

  @Column({ name: 'id_programa', nullable: true })
  idPrograma: number | null;

  @Column({ name: 'id_grado', type: 'smallint', nullable: true })
  idGrado: number | null;

  @Column({ name: 'universidad_otra', type: 'varchar', length: 200, nullable: true })
  universidadOtra: string | null;

  @Column({ type: 'smallint', nullable: true })
  ciclo: number | null;

  @Column({ type: 'enum', enum: CondicionAcademica, enumName: 'condicion_academica', nullable: true })
  condicion: CondicionAcademica | null;

  @Column({ name: 'anio_egreso', type: 'smallint', nullable: true })
  anioEgreso: number | null;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Lead;

  @ManyToOne(() => Universidad, { nullable: true })
  @JoinColumn({ name: 'id_universidad' })
  universidad: Universidad | null;

  @ManyToOne(() => Facultad, { nullable: true })
  @JoinColumn({ name: 'id_facultad' })
  facultad: Facultad | null;

  @ManyToOne(() => ProgramaAcademico, { nullable: true })
  @JoinColumn({ name: 'id_programa' })
  programa: ProgramaAcademico | null;

  @ManyToOne(() => GradoAcademico, { nullable: true })
  @JoinColumn({ name: 'id_grado' })
  grado: GradoAcademico | null;
}
`,

  'perfil-laboral.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Lead } from './lead.entity.js';

@Entity('perfil_laboral')
export class PerfilLaboral {
  @PrimaryGeneratedColumn({ name: 'id_perfil_laboral' })
  idPerfilLaboral: number;

  @Column({ name: 'id_lead', type: 'bigint', unique: true })
  idLead: string;

  @Column({ type: 'boolean', nullable: true })
  trabaja: boolean | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  ocupacion: string | null;

  @Column({ name: 'horas_libres_semana', type: 'smallint', nullable: true })
  horasLibresSemana: number | null;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Lead;
}
`,

  'consentimiento-datos.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Lead } from './lead.entity.js';

@Entity('consentimiento_datos')
export class ConsentimientoDatos {
  @PrimaryGeneratedColumn({ name: 'id_consentimiento' })
  idConsentimiento: number;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ type: 'varchar', length: 100 })
  finalidad: string;

  @Column({ type: 'boolean' })
  aceptado: boolean;

  @Column({ name: 'version_politica', type: 'varchar', length: 20, nullable: true })
  versionPolitica: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha: Date;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  medio: string | null;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Lead;
}
`,

  'servicio.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ModeloCobro, ModalidadServicio } from '../common/enums/database.enums.js';
import { GradoAcademico } from './grado-academico.entity.js';

@Entity('servicio')
export class Servicio {
  @PrimaryGeneratedColumn({ name: 'id_servicio' })
  idServicio: number;

  @Column({ type: 'varchar', length: 30, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ name: 'id_grado', type: 'smallint', nullable: true })
  idGrado: number | null;

  @Column({ name: 'modelo_cobro', type: 'enum', enum: ModeloCobro, enumName: 'modelo_cobro', default: ModeloCobro.PAGO_UNICO })
  modeloCobro: ModeloCobro;

  @Column({ type: 'enum', enum: ModalidadServicio, enumName: 'modalidad_servicio', default: ModalidadServicio.VIRTUAL })
  modalidad: ModalidadServicio;

  @Column({ type: 'text', nullable: true })
  alcance: string | null;

  @Column({ name: 'duracion_dias', type: 'int', nullable: true })
  duracionDias: number | null;

  @Column({ name: 'precio_base', type: 'decimal', precision: 10, scale: 2 })
  precioBase: string;

  @Column({ type: 'char', length: 3, default: 'PEN' })
  moneda: string;

  @Column({ name: 'incluye_control_similitud', type: 'boolean', default: true })
  incluyeControlSimilitud: boolean;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ManyToOne(() => GradoAcademico, { nullable: true })
  @JoinColumn({ name: 'id_grado' })
  grado: GradoAcademico | null;
}
`,

  'proyecto-tesis.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Lead } from './lead.entity.js';
import { EtapaTesis } from './etapa-tesis.entity.js';
import { Servicio } from './servicio.entity.js';

@Entity('proyecto_tesis')
export class ProyectoTesis {
  @PrimaryGeneratedColumn({ name: 'id_proyecto' })
  idProyecto: number;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ type: 'text', nullable: true })
  tema: string | null;

  @Column({ name: 'id_etapa', nullable: true })
  idEtapa: number | null;

  @Column({ name: 'id_servicio_interes', nullable: true })
  idServicioInteres: number | null;

  @Column({ name: 'fecha_limite', type: 'date', nullable: true })
  fechaLimite: string | null;

  @Column({ type: 'text', nullable: true })
  observaciones: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Lead;

  @ManyToOne(() => EtapaTesis, { nullable: true })
  @JoinColumn({ name: 'id_etapa' })
  etapa: EtapaTesis | null;

  @ManyToOne(() => Servicio, { nullable: true })
  @JoinColumn({ name: 'id_servicio_interes' })
  servicioInteres: Servicio | null;
}
`,

  'proyecto-necesidad.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { ProyectoTesis } from './proyecto-tesis.entity.js';
import { NecesidadAcademica } from './necesidad-academica.entity.js';

@Entity('proyecto_necesidad')
export class ProyectoNecesidad {
  @PrimaryColumn({ name: 'id_proyecto' })
  idProyecto: number;

  @PrimaryColumn({ name: 'id_necesidad' })
  idNecesidad: number;

  @Column({ type: 'smallint', default: 1, nullable: true })
  prioridad: number | null;

  @ManyToOne(() => ProyectoTesis, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_proyecto' })
  proyecto: ProyectoTesis;

  @ManyToOne(() => NecesidadAcademica)
  @JoinColumn({ name: 'id_necesidad' })
  necesidad: NecesidadAcademica;
}
`,

  'descarga-recurso.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CanalContacto } from '../common/enums/database.enums.js';
import { RecursoGratuito } from './recurso-gratuito.entity.js';
import { Lead } from './lead.entity.js';
import { SesionLanding } from './sesion-landing.entity.js';

@Entity('descarga_recurso')
export class DescargaRecurso {
  @PrimaryGeneratedColumn({ name: 'id_descarga', type: 'bigint' })
  idDescarga: string;

  @Column({ name: 'id_recurso' })
  idRecurso: number;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'id_sesion', type: 'bigint', nullable: true })
  idSesion: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha: Date;

  @Column({ name: 'canal_entrega', type: 'enum', enum: CanalContacto, enumName: 'canal_contacto', nullable: true })
  canalEntrega: CanalContacto | null;

  @Column({ type: 'boolean', default: false })
  entregado: boolean;

  @ManyToOne(() => RecursoGratuito)
  @JoinColumn({ name: 'id_recurso' })
  recurso: RecursoGratuito;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Lead;

  @ManyToOne(() => SesionLanding, { nullable: true })
  @JoinColumn({ name: 'id_sesion' })
  sesion: SesionLanding | null;
}
`,

  'conversacion.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CanalContacto, EstadoConversacion } from '../common/enums/database.enums.js';
import { Lead } from './lead.entity.js';
import { AgenteIa } from './agente-ia.entity.js';
import { Publicacion } from './publicacion.entity.js';
import { NecesidadAcademica } from './necesidad-academica.entity.js';

@Entity('conversacion')
export class Conversacion {
  @PrimaryGeneratedColumn({ name: 'id_conversacion', type: 'bigint' })
  idConversacion: string;

  @Column({ name: 'id_lead', type: 'bigint', nullable: true })
  idLead: string | null;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @Column({ name: 'id_publicacion', nullable: true })
  idPublicacion: number | null;

  @Column({ type: 'enum', enum: CanalContacto, enumName: 'canal_contacto' })
  canal: CanalContacto;

  @Column({ name: 'identificador_externo', type: 'varchar', length: 150, nullable: true })
  identificadorExterno: string | null;

  @Column({ type: 'smallint', default: 1 })
  fase: number;

  @Column({ type: 'enum', enum: EstadoConversacion, enumName: 'estado_conversacion', default: EstadoConversacion.ABIERTA })
  estado: EstadoConversacion;

  @Column({ name: 'id_necesidad', nullable: true })
  idNecesidad: number | null;

  @Column({ name: 'nivel_interes', type: 'smallint', nullable: true })
  nivelInteres: number | null;

  @CreateDateColumn({ name: 'iniciada_en', type: 'timestamptz' })
  iniciadaEn: Date;

  @Column({ name: 'cerrada_en', type: 'timestamptz', nullable: true })
  cerradaEn: Date | null;

  @ManyToOne(() => Lead, { nullable: true })
  @JoinColumn({ name: 'id_lead' })
  lead: Lead | null;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: AgenteIa | null;

  @ManyToOne(() => Publicacion, { nullable: true })
  @JoinColumn({ name: 'id_publicacion' })
  publicacion: Publicacion | null;

  @ManyToOne(() => NecesidadAcademica, { nullable: true })
  @JoinColumn({ name: 'id_necesidad' })
  necesidad: NecesidadAcademica | null;
}
`,

  'mensaje.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TipoRemitente } from '../common/enums/database.enums.js';
import { Conversacion } from './conversacion.entity.js';
import { AgenteIa } from './agente-ia.entity.js';
import { UsuarioInterno } from './usuario-interno.entity.js';

@Entity('mensaje')
export class Mensaje {
  @PrimaryGeneratedColumn({ name: 'id_mensaje', type: 'bigint' })
  idMensaje: string;

  @Column({ name: 'id_conversacion', type: 'bigint' })
  idConversacion: string;

  @Column({ type: 'enum', enum: TipoRemitente, enumName: 'tipo_remitente' })
  remitente: TipoRemitente;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @Column({ name: 'id_usuario', nullable: true })
  idUsuario: number | null;

  @Column({ type: 'text' })
  contenido: string;

  @Column({ name: 'es_consulta_servicio', type: 'boolean', default: false })
  esConsultaServicio: boolean;

  @CreateDateColumn({ name: 'enviado_en', type: 'timestamptz' })
  enviadoEn: Date;

  @Column({ name: 'tiempo_respuesta_ms', type: 'int', nullable: true })
  tiempoRespuestaMs: number | null;

  @Column({ name: 'calificacion_positiva', type: 'boolean', nullable: true })
  calificacionPositiva: boolean | null;

  @ManyToOne(() => Conversacion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_conversacion' })
  conversacion: Conversacion;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: AgenteIa | null;

  @ManyToOne(() => UsuarioInterno, { nullable: true })
  @JoinColumn({ name: 'id_usuario' })
  usuario: UsuarioInterno | null;
}
`,

  'derivacion-humana.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoDerivacion } from '../common/enums/database.enums.js';
import { Conversacion } from './conversacion.entity.js';
import { Lead } from './lead.entity.js';
import { UsuarioInterno } from './usuario-interno.entity.js';

@Entity('derivacion_humana')
export class DerivacionHumana {
  @PrimaryGeneratedColumn({ name: 'id_derivacion' })
  idDerivacion: number;

  @Column({ name: 'id_conversacion', type: 'bigint' })
  idConversacion: string;

  @Column({ name: 'id_lead', type: 'bigint', nullable: true })
  idLead: string | null;

  @Column({ type: 'text' })
  motivo: string;

  @Column({ name: 'id_usuario_asignado', nullable: true })
  idUsuarioAsignado: number | null;

  @Column({ type: 'enum', enum: EstadoDerivacion, enumName: 'estado_derivacion', default: EstadoDerivacion.PENDIENTE })
  estado: EstadoDerivacion;

  @CreateDateColumn({ name: 'derivada_en', type: 'timestamptz' })
  derivadaEn: Date;

  @Column({ name: 'atendida_en', type: 'timestamptz', nullable: true })
  atendidaEn: Date | null;

  @Column({ type: 'text', nullable: true })
  resolucion: string | null;

  @ManyToOne(() => Conversacion)
  @JoinColumn({ name: 'id_conversacion' })
  conversacion: Conversacion;

  @ManyToOne(() => Lead, { nullable: true })
  @JoinColumn({ name: 'id_lead' })
  lead: Lead | null;

  @ManyToOne(() => UsuarioInterno, { nullable: true })
  @JoinColumn({ name: 'id_usuario_asignado' })
  usuarioAsignado: UsuarioInterno | null;
}
`,

  'propuesta.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoPropuesta, ModalidadServicio } from '../common/enums/database.enums.js';
import { Lead } from './lead.entity.js';
import { ProyectoTesis } from './proyecto-tesis.entity.js';
import { Conversacion } from './conversacion.entity.js';
import { AgenteIa } from './agente-ia.entity.js';
import { UsuarioInterno } from './usuario-interno.entity.js';

@Entity('propuesta')
export class Propuesta {
  @PrimaryGeneratedColumn({ name: 'id_propuesta', type: 'bigint' })
  idPropuesta: string;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'id_proyecto', nullable: true })
  idProyecto: number | null;

  @Column({ name: 'id_conversacion', type: 'bigint', nullable: true })
  idConversacion: string | null;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @Column({ name: 'id_usuario', nullable: true })
  idUsuario: number | null;

  @Column({ type: 'enum', enum: EstadoPropuesta, enumName: 'estado_propuesta', default: EstadoPropuesta.BORRADOR })
  estado: EstadoPropuesta;

  @Column({ type: 'enum', enum: ModalidadServicio, enumName: 'modalidad_servicio', nullable: true })
  modalidad: ModalidadServicio | null;

  @Column({ name: 'tiempo_entrega_dias', type: 'int', nullable: true })
  tiempoEntregaDias: number | null;

  @Column({ name: 'monto_total', type: 'decimal', precision: 10, scale: 2, default: 0 })
  montoTotal: string;

  @Column({ type: 'char', length: 3, default: 'PEN' })
  moneda: string;

  @Column({ type: 'text', nullable: true })
  condiciones: string | null;

  @Column({ name: 'fecha_envio', type: 'timestamptz', nullable: true })
  fechaEnvio: Date | null;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  vigenteHasta: string | null;

  @Column({ name: 'fecha_respuesta', type: 'timestamptz', nullable: true })
  fechaRespuesta: Date | null;

  @Column({ name: 'motivo_rechazo', type: 'text', nullable: true })
  motivoRechazo: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Lead;

  @ManyToOne(() => ProyectoTesis, { nullable: true })
  @JoinColumn({ name: 'id_proyecto' })
  proyecto: ProyectoTesis | null;

  @ManyToOne(() => Conversacion, { nullable: true })
  @JoinColumn({ name: 'id_conversacion' })
  conversacion: Conversacion | null;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: AgenteIa | null;

  @ManyToOne(() => UsuarioInterno, { nullable: true })
  @JoinColumn({ name: 'id_usuario' })
  usuario: UsuarioInterno | null;
}
`,

  'propuesta-detalle.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Propuesta } from './propuesta.entity.js';
import { Servicio } from './servicio.entity.js';
import { EtapaTesis } from './etapa-tesis.entity.js';

@Entity('propuesta_detalle')
export class PropuestaDetalle {
  @PrimaryGeneratedColumn({ name: 'id_detalle', type: 'bigint' })
  idDetalle: string;

  @Column({ name: 'id_propuesta', type: 'bigint' })
  idPropuesta: string;

  @Column({ name: 'id_servicio' })
  idServicio: number;

  @Column({ name: 'id_etapa', nullable: true })
  idEtapa: number | null;

  @Column({ type: 'varchar', length: 250, nullable: true })
  descripcion: string | null;

  @Column({ type: 'smallint', default: 1 })
  cantidad: number;

  @Column({ name: 'precio_unitario', type: 'decimal', precision: 10, scale: 2 })
  precioUnitario: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  descuento: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, insert: false, update: false, nullable: true })
  subtotal: string | null;

  @ManyToOne(() => Propuesta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_propuesta' })
  propuesta: Propuesta;

  @ManyToOne(() => Servicio)
  @JoinColumn({ name: 'id_servicio' })
  servicio: Servicio;

  @ManyToOne(() => EtapaTesis, { nullable: true })
  @JoinColumn({ name: 'id_etapa' })
  etapa: EtapaTesis | null;
}
`,

  'objecion.entity.ts': `import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TipoObjecion } from '../common/enums/database.enums.js';

@Entity('objecion')
export class Objecion {
  @PrimaryGeneratedColumn({ name: 'id_objecion' })
  idObjecion: number;

  @Column({ type: 'enum', enum: TipoObjecion, enumName: 'tipo_objecion' })
  tipo: TipoObjecion;

  @Column({ type: 'varchar', length: 250 })
  descripcion: string;

  @Column({ name: 'respuesta_sugerida', type: 'text', nullable: true })
  respuestaSugerida: string | null;

  @Column({ type: 'boolean', default: true })
  activa: boolean;
}
`,

  'lead-objecion.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Lead } from './lead.entity.js';
import { Propuesta } from './propuesta.entity.js';
import { Objecion } from './objecion.entity.js';
import { Mensaje } from './mensaje.entity.js';

@Entity('lead_objecion')
export class LeadObjecion {
  @PrimaryGeneratedColumn({ name: 'id_lead_objecion', type: 'bigint' })
  idLeadObjecion: string;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'id_propuesta', type: 'bigint', nullable: true })
  idPropuesta: string | null;

  @Column({ name: 'id_objecion' })
  idObjecion: number;

  @Column({ name: 'id_mensaje', type: 'bigint', nullable: true })
  idMensaje: string | null;

  @Column({ type: 'text', nullable: true })
  detalle: string | null;

  @Column({ type: 'boolean', default: false })
  resuelta: boolean;

  @CreateDateColumn({ name: 'registrada_en', type: 'timestamptz' })
  registradaEn: Date;

  @Column({ name: 'resuelta_en', type: 'timestamptz', nullable: true })
  resueltaEn: Date | null;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Lead;

  @ManyToOne(() => Propuesta, { nullable: true })
  @JoinColumn({ name: 'id_propuesta' })
  propuesta: Propuesta | null;

  @ManyToOne(() => Objecion)
  @JoinColumn({ name: 'id_objecion' })
  objecion: Objecion;

  @ManyToOne(() => Mensaje, { nullable: true })
  @JoinColumn({ name: 'id_mensaje' })
  mensaje: Mensaje | null;
}
`,

  'seguimiento.entity.ts': `import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CanalContacto, EstadoSeguimiento } from '../common/enums/database.enums.js';
import { Propuesta } from './propuesta.entity.js';
import { Lead } from './lead.entity.js';
import { AgenteIa } from './agente-ia.entity.js';

@Entity('seguimiento')
export class Seguimiento {
  @PrimaryGeneratedColumn({ name: 'id_seguimiento', type: 'bigint' })
  idSeguimiento: string;

  @Column({ name: 'id_propuesta', type: 'bigint' })
  idPropuesta: string;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @Column({ name: 'nro_intento', type: 'smallint', default: 1 })
  nroIntento: number;

  @Column({ type: 'enum', enum: CanalContacto, enumName: 'canal_contacto', nullable: true })
  canal: CanalContacto | null;

  @Column({ type: 'enum', enum: EstadoSeguimiento, enumName: 'estado_seguimiento', default: EstadoSeguimiento.PROGRAMADO })
  estado: EstadoSeguimiento;

  @Column({ name: 'fecha_programada', type: 'timestamptz' })
  fechaProgramada: Date;

  @Column({ name: 'fecha_envio', type: 'timestamptz', nullable: true })
  fechaEnvio: Date | null;

  @Column({ type: 'text', nullable: true })
  mensaje: string | null;

  @Column({ type: 'text', nullable: true })
  resultado: string | null;

  @Column({ name: 'generado_por_ia', type: 'boolean', default: true })
  generadoPorIa: boolean;

  @ManyToOne(() => Propuesta)
  @JoinColumn({ name: 'id_propuesta' })
  propuesta: Propuesta;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Lead;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: AgenteIa | null;
}
`,

  'contrato.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Propuesta } from './propuesta.entity.js';
import { Lead } from './lead.entity.js';

@Entity('contrato')
export class Contrato {
  @PrimaryGeneratedColumn({ name: 'id_contrato' })
  idContrato: number;

  @Column({ name: 'id_propuesta', type: 'bigint', unique: true })
  idPropuesta: string;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'version_clausulas', type: 'varchar', length: 20, default: '1.0' })
  versionClausulas: string;

  @Column({ name: 'acepta_autoria_estudiante', type: 'boolean', default: true })
  aceptaAutoriaEstudiante: boolean;

  @Column({ name: 'archivo_url', type: 'text', nullable: true })
  archivoUrl: string | null;

  @CreateDateColumn({ name: 'fecha_firma', type: 'timestamptz' })
  fechaFirma: Date;

  @ManyToOne(() => Propuesta)
  @JoinColumn({ name: 'id_propuesta' })
  propuesta: Propuesta;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Lead;
}
`,

  'pago.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MetodoPago, EstadoPago } from '../common/enums/database.enums.js';
import { Contrato } from './contrato.entity.js';
import { Lead } from './lead.entity.js';

@Entity('pago')
export class Pago {
  @PrimaryGeneratedColumn({ name: 'id_pago' })
  idPago: number;

  @Column({ name: 'id_contrato' })
  idContrato: number;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'nro_cuota', type: 'smallint', default: 1 })
  nroCuota: number;

  @Column({ type: 'varchar', length: 150, nullable: true })
  concepto: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monto: string;

  @Column({ type: 'char', length: 3, default: 'PEN' })
  moneda: string;

  @Column({ type: 'enum', enum: MetodoPago, enumName: 'metodo_pago', nullable: true })
  metodo: MetodoPago | null;

  @Column({ type: 'enum', enum: EstadoPago, enumName: 'estado_pago', default: EstadoPago.PENDIENTE })
  estado: EstadoPago;

  @Column({ name: 'referencia_operacion', type: 'varchar', length: 100, nullable: true })
  referenciaOperacion: string | null;

  @Column({ name: 'comprobante_url', type: 'text', nullable: true })
  comprobanteUrl: string | null;

  @Column({ name: 'fecha_pago', type: 'timestamptz', nullable: true })
  fechaPago: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Contrato)
  @JoinColumn({ name: 'id_contrato' })
  contrato: Contrato;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Lead;
}
`,

  'cliente.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Lead } from './lead.entity.js';
import { Propuesta } from './propuesta.entity.js';

@Entity('cliente')
export class Cliente {
  @PrimaryGeneratedColumn({ name: 'id_cliente' })
  idCliente: number;

  @Column({ name: 'id_lead', type: 'bigint', unique: true })
  idLead: string;

  @Column({ name: 'id_propuesta_origen', type: 'bigint', nullable: true })
  idPropuestaOrigen: string | null;

  @CreateDateColumn({ name: 'fecha_conversion', type: 'timestamptz' })
  fechaConversion: Date;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Lead;

  @ManyToOne(() => Propuesta, { nullable: true })
  @JoinColumn({ name: 'id_propuesta_origen' })
  propuestaOrigen: Propuesta | null;
}
`,

  'kpi-definicion.entity.ts': `import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('kpi_definicion')
export class KpiDefinicion {
  @PrimaryGeneratedColumn({ name: 'id_kpi' })
  idKpi: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'smallint' })
  fase: number;

  @Column({ type: 'text', nullable: true })
  formula: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  unidad: string | null;

  @Column({ name: 'umbral_rojo', type: 'decimal', precision: 10, scale: 2 })
  umbralRojo: string;

  @Column({ name: 'umbral_verde', type: 'decimal', precision: 10, scale: 2 })
  umbralVerde: string;

  @Column({ name: 'mayor_es_mejor', type: 'boolean', default: true })
  mayorEsMejor: boolean;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;
}
`,

  'kpi-medicion.entity.ts': `import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Semaforo } from '../common/enums/database.enums.js';
import { KpiDefinicion } from './kpi-definicion.entity.js';
import { Universidad } from './universidad.entity.js';
import { Campana } from './campana.entity.js';
import { AgenteIa } from './agente-ia.entity.js';

@Entity('kpi_medicion')
export class KpiMedicion {
  @PrimaryGeneratedColumn({ name: 'id_medicion', type: 'bigint' })
  idMedicion: string;

  @Column({ name: 'id_kpi' })
  idKpi: number;

  @Column({ name: 'periodo_inicio', type: 'date' })
  periodoInicio: string;

  @Column({ name: 'periodo_fin', type: 'date' })
  periodoFin: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  numerador: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  denominador: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  valor: string;

  @Column({ type: 'enum', enum: Semaforo, enumName: 'semaforo', nullable: true })
  semaforo: Semaforo | null;

  @Column({ name: 'id_universidad', nullable: true })
  idUniversidad: number | null;

  @Column({ name: 'id_campana', nullable: true })
  idCampana: number | null;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => KpiDefinicion)
  @JoinColumn({ name: 'id_kpi' })
  kpi: KpiDefinicion;

  @ManyToOne(() => Universidad, { nullable: true })
  @JoinColumn({ name: 'id_universidad' })
  universidad: Universidad | null;

  @ManyToOne(() => Campana, { nullable: true })
  @JoinColumn({ name: 'id_campana' })
  campana: Campana | null;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: AgenteIa | null;
}
`,
};

if (!existsSync(entitiesDir)) mkdirSync(entitiesDir, { recursive: true });

for (const [filename, content] of Object.entries(entities)) {
  writeFileSync(join(entitiesDir, filename), content, 'utf8');
}

writeFileSync(
  join(entitiesDir, 'index.ts'),
  Object.keys(entities)
    .map((f) => {
      const name = f.replace('.entity.ts', '');
      const className = name
        .split('-')
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('');
      return `export { ${className} } from './${name.replace(/\.entity$/, '')}.entity.js';`;
    })
    .join('\n') + '\n',
  'utf8',
);

console.log(`Generated ${Object.keys(entities).length} entities.`);
