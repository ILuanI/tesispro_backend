import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
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
  lead: Relation<Lead>;

  @ManyToOne(() => Universidad, { nullable: true })
  @JoinColumn({ name: 'id_universidad' })
  universidad: Relation<Universidad> | null;

  @ManyToOne(() => Facultad, { nullable: true })
  @JoinColumn({ name: 'id_facultad' })
  facultad: Relation<Facultad> | null;

  @ManyToOne(() => ProgramaAcademico, { nullable: true })
  @JoinColumn({ name: 'id_programa' })
  programa: Relation<ProgramaAcademico> | null;

  @ManyToOne(() => GradoAcademico, { nullable: true })
  @JoinColumn({ name: 'id_grado' })
  grado: Relation<GradoAcademico> | null;
}
