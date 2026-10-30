import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CanalContacto, EstadoConversacion } from '../common/enums/database.enums.js';
import { Lead } from './lead.entity.js';
import { AgenteIa } from './agente-ia.entity.js';
import { Publicacion } from './publicacion.entity.js';
import { NecesidadAcademica } from './necesidad-academica.entity.js';

@Entity('conversacion')
export class Conversacion {
  @PrimaryGeneratedColumn({ name: 'id_conversacion', type: 'bigint' })
  idConversacion: string;

  @Column({ name: 'id_lead', type: 'bigint', nullable: true })
  idLead: string | null;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @Column({ name: 'id_publicacion', nullable: true })
  idPublicacion: number | null;

  @Column({ type: 'enum', enum: CanalContacto, enumName: 'canal_contacto' })
  canal: CanalContacto;

  @Column({ name: 'identificador_externo', type: 'varchar', length: 150, nullable: true })
  identificadorExterno: string | null;

  @Column({ type: 'smallint', default: 1 })
  fase: number;

  @Column({ type: 'enum', enum: EstadoConversacion, enumName: 'estado_conversacion', default: EstadoConversacion.ABIERTA })
  estado: EstadoConversacion;

  @Column({ name: 'id_necesidad', nullable: true })
  idNecesidad: number | null;

  @Column({ name: 'nivel_interes', type: 'smallint', nullable: true })
  nivelInteres: number | null;

  @CreateDateColumn({ name: 'iniciada_en', type: 'timestamptz' })
  iniciadaEn: Date;

  @Column({ name: 'cerrada_en', type: 'timestamptz', nullable: true })
  cerradaEn: Date | null;

  @ManyToOne(() => Lead, { nullable: true })
  @JoinColumn({ name: 'id_lead' })
  lead: Relation<Lead> | null;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: Relation<AgenteIa> | null;

  @ManyToOne(() => Publicacion, { nullable: true })
  @JoinColumn({ name: 'id_publicacion' })
  publicacion: Relation<Publicacion> | null;

  @ManyToOne(() => NecesidadAcademica, { nullable: true })
  @JoinColumn({ name: 'id_necesidad' })
  necesidad: Relation<NecesidadAcademica> | null;
}
