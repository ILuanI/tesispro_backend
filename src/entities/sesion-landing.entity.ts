import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
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
  publicacion: Relation<Publicacion> | null;

  @ManyToOne(() => Campana, { nullable: true })
  @JoinColumn({ name: 'id_campana' })
  campana: Relation<Campana> | null;

  @ManyToOne(() => EnlaceReferido, { nullable: true })
  @JoinColumn({ name: 'id_referido' })
  referido: Relation<EnlaceReferido> | null;

  @ManyToOne(() => ConvenioInstitucional, { nullable: true })
  @JoinColumn({ name: 'id_convenio' })
  convenio: Relation<ConvenioInstitucional> | null;

  @ManyToOne(() => RecursoGratuito, { nullable: true })
  @JoinColumn({ name: 'id_recurso' })
  recurso: Relation<RecursoGratuito> | null;
}
