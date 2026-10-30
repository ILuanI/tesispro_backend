import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
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
  universidad: Relation<Universidad>;

  @OneToMany(() => ProgramaAcademico, (programa) => programa.facultad)
  programas: ProgramaAcademico[];
}
