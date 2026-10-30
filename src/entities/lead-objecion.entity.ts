import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Lead } from './lead.entity.js';
import { Propuesta } from './propuesta.entity.js';
import { Objecion } from './objecion.entity.js';
import { Mensaje } from './mensaje.entity.js';

@Entity('lead_objecion')
export class LeadObjecion {
  @PrimaryGeneratedColumn({ name: 'id_lead_objecion', type: 'bigint' })
  idLeadObjecion: string;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'id_propuesta', type: 'bigint', nullable: true })
  idPropuesta: string | null;

  @Column({ name: 'id_objecion' })
  idObjecion: number;

  @Column({ name: 'id_mensaje', type: 'bigint', nullable: true })
  idMensaje: string | null;

  @Column({ type: 'text', nullable: true })
  detalle: string | null;

  @Column({ type: 'boolean', default: false })
  resuelta: boolean;

  @CreateDateColumn({ name: 'registrada_en', type: 'timestamptz' })
  registradaEn: Date;

  @Column({ name: 'resuelta_en', type: 'timestamptz', nullable: true })
  resueltaEn: Date | null;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Relation<Lead>;

  @ManyToOne(() => Propuesta, { nullable: true })
  @JoinColumn({ name: 'id_propuesta' })
  propuesta: Relation<Propuesta> | null;

  @ManyToOne(() => Objecion)
  @JoinColumn({ name: 'id_objecion' })
  objecion: Relation<Objecion>;

  @ManyToOne(() => Mensaje, { nullable: true })
  @JoinColumn({ name: 'id_mensaje' })
  mensaje: Relation<Mensaje> | null;
}
