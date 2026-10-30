import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Lead } from './lead.entity.js';

@Entity('enlace_referido')
export class EnlaceReferido {
  @PrimaryGeneratedColumn({ name: 'id_referido' })
  idReferido: number;

  @Column({ name: 'id_lead_referente', type: 'bigint' })
  idLeadReferente: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  codigo: string;

  @CreateDateColumn({ name: 'fecha_creacion', type: 'timestamptz' })
  fechaCreacion: Date;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead_referente' })
  leadReferente: Relation<Lead>;
}
