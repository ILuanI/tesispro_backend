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

  @Column({ name: 'id_etapa', nullable: true })
  idEtapa: number | null;

  @Column({ name: 'id_grado', type: 'smallint', nullable: true })
  idGrado: number | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ManyToOne(() => EtapaTesis, { nullable: true })
  @JoinColumn({ name: 'id_etapa' })
  etapa: Relation<EtapaTesis> | null;

  @ManyToOne(() => GradoAcademico, { nullable: true })
  @JoinColumn({ name: 'id_grado' })
  grado: Relation<GradoAcademico> | null;
}
