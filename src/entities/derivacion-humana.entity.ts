import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoDerivacion } from '../common/enums/database.enums.js';
import { Conversacion } from './conversacion.entity.js';
import { Lead } from './lead.entity.js';
import { UsuarioInterno } from './usuario-interno.entity.js';

@Entity('derivacion_humana')
export class DerivacionHumana {
  @PrimaryGeneratedColumn({ name: 'id_derivacion' })
  idDerivacion: number;

  @Column({ name: 'id_conversacion', type: 'bigint' })
  idConversacion: string;

  @Column({ name: 'id_lead', type: 'bigint', nullable: true })
  idLead: string | null;

  @Column({ type: 'text' })
  motivo: string;

  @Column({ name: 'id_usuario_asignado', nullable: true })
  idUsuarioAsignado: number | null;

  @Column({ type: 'enum', enum: EstadoDerivacion, enumName: 'estado_derivacion', default: EstadoDerivacion.PENDIENTE })
  estado: EstadoDerivacion;

  @CreateDateColumn({ name: 'derivada_en', type: 'timestamptz' })
  derivadaEn: Date;

  @Column({ name: 'atendida_en', type: 'timestamptz', nullable: true })
  atendidaEn: Date | null;

  @Column({ type: 'text', nullable: true })
  resolucion: string | null;

  @ManyToOne(() => Conversacion)
  @JoinColumn({ name: 'id_conversacion' })
  conversacion: Relation<Conversacion>;

  @ManyToOne(() => Lead, { nullable: true })
  @JoinColumn({ name: 'id_lead' })
  lead: Relation<Lead> | null;

  @ManyToOne(() => UsuarioInterno, { nullable: true })
  @JoinColumn({ name: 'id_usuario_asignado' })
  usuarioAsignado: Relation<UsuarioInterno> | null;
}
