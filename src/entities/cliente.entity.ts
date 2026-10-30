import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Lead } from './lead.entity.js';
import { Propuesta } from './propuesta.entity.js';

@Entity('cliente')
export class Cliente {
  @PrimaryGeneratedColumn({ name: 'id_cliente' })
  idCliente: number;

  @Column({ name: 'id_lead', type: 'bigint', unique: true })
  idLead: string;

  @Column({ name: 'id_propuesta_origen', type: 'bigint', nullable: true })
  idPropuestaOrigen: string | null;

  @CreateDateColumn({ name: 'fecha_conversion', type: 'timestamptz' })
  fechaConversion: Date;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Relation<Lead>;

  @ManyToOne(() => Propuesta, { nullable: true })
  @JoinColumn({ name: 'id_propuesta_origen' })
  propuestaOrigen: Relation<Propuesta> | null;
}
