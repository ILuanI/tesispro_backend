import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
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
  grado: Relation<GradoAcademico> | null;
}
