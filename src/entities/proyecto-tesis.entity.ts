import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
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
  lead: Relation<Lead>;

  @ManyToOne(() => EtapaTesis, { nullable: true })
  @JoinColumn({ name: 'id_etapa' })
  etapa: Relation<EtapaTesis> | null;

  @ManyToOne(() => Servicio, { nullable: true })
  @JoinColumn({ name: 'id_servicio_interes' })
  servicioInteres: Relation<Servicio> | null;
}
