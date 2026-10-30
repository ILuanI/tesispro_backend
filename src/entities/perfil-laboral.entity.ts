import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
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
  lead: Relation<Lead>;
}
