import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Lead } from './lead.entity.js';
import { EstadoLead } from './estado-lead.entity.js';
import { UsuarioInterno } from './usuario-interno.entity.js';
import { AgenteIa } from './agente-ia.entity.js';

@Entity('lead_estado_historial')
export class LeadEstadoHistorial {
  @PrimaryGeneratedColumn({ name: 'id_historial', type: 'bigint' })
  idHistorial: string;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'id_estado', type: 'smallint' })
  idEstado: number;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha: Date;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  @Column({ name: 'id_usuario', nullable: true })
  idUsuario: number | null;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Relation<Lead>;

  @ManyToOne(() => EstadoLead)
  @JoinColumn({ name: 'id_estado' })
  estado: Relation<EstadoLead>;

  @ManyToOne(() => UsuarioInterno, { nullable: true })
  @JoinColumn({ name: 'id_usuario' })
  usuario: Relation<UsuarioInterno> | null;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: Relation<AgenteIa> | null;
}
