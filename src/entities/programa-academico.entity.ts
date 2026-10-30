import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Facultad } from './facultad.entity.js';
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

  @ManyToOne('Facultad', 'programas')
  @JoinColumn({ name: 'id_facultad' })
  facultad: Facultad;

  @ManyToOne(() => GradoAcademico)
  @JoinColumn({ name: 'id_grado' })
  grado: Relation<GradoAcademico>;
}
