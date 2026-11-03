import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
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

  @Column({ type: 'varchar', length: 40, default: 'material_propio' })
  categoria: string;

  @Column({ type: 'varchar', length: 10, default: 'pdf' })
  formato: string;

  @Column({ name: 'fecha_creacion', type: 'timestamptz', default: () => 'now()' })
  fechaCreacion: Date;

  @Column({ name: 'fecha_actualizacion', type: 'timestamptz', default: () => 'now()' })
  fechaActualizacion: Date;

  @Column({ name: 'archivo_nombre', type: 'varchar', length: 255, nullable: true })
  archivoNombre: string | null;

  @Column({ name: 'archivo_mime', type: 'varchar', length: 100, nullable: true })
  archivoMime: string | null;

  @Column({ name: 'archivo_contenido', type: 'bytea', nullable: true, select: false })
  archivoContenido: Buffer | null;

  @Column({ name: 'id_etapa', nullable: true })
  idEtapa: number | null;

  @Column({ name: 'id_grado', type: 'smallint', nullable: true })
  idGrado: number | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({type:'boolean',default:false})
  publicado: boolean;

  @Column({type:'boolean',default:false})
  destacado: boolean;

  @ManyToOne(() => EtapaTesis, { nullable: true })
  @JoinColumn({ name: 'id_etapa' })
  etapa: Relation<EtapaTesis> | null;

  @ManyToOne(() => GradoAcademico, { nullable: true })
  @JoinColumn({ name: 'id_grado' })
  grado: Relation<GradoAcademico> | null;
}
