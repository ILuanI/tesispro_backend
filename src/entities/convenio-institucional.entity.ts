import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
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
  universidad: Relation<Universidad> | null;
}
