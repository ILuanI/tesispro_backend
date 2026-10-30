import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoPropuesta, ModalidadServicio } from '../common/enums/database.enums.js';
import { Lead } from './lead.entity.js';
import { ProyectoTesis } from './proyecto-tesis.entity.js';
import { Conversacion } from './conversacion.entity.js';
import { AgenteIa } from './agente-ia.entity.js';
import { UsuarioInterno } from './usuario-interno.entity.js';

@Entity('propuesta')
export class Propuesta {
  @PrimaryGeneratedColumn({ name: 'id_propuesta', type: 'bigint' })
  idPropuesta: string;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'id_proyecto', nullable: true })
  idProyecto: number | null;

  @Column({ name: 'id_conversacion', type: 'bigint', nullable: true })
  idConversacion: string | null;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @Column({ name: 'id_usuario', nullable: true })
  idUsuario: number | null;

  @Column({ type: 'enum', enum: EstadoPropuesta, enumName: 'estado_propuesta', default: EstadoPropuesta.BORRADOR })
  estado: EstadoPropuesta;

  @Column({ type: 'enum', enum: ModalidadServicio, enumName: 'modalidad_servicio', nullable: true })
  modalidad: ModalidadServicio | null;

  @Column({ name: 'tiempo_entrega_dias', type: 'int', nullable: true })
  tiempoEntregaDias: number | null;

  @Column({ name: 'monto_total', type: 'decimal', precision: 10, scale: 2, default: 0 })
  montoTotal: string;

  @Column({ type: 'char', length: 3, default: 'PEN' })
  moneda: string;

  @Column({ type: 'text', nullable: true })
  condiciones: string | null;

  @Column({ name: 'fecha_envio', type: 'timestamptz', nullable: true })
  fechaEnvio: Date | null;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  vigenteHasta: string | null;

  @Column({ name: 'fecha_respuesta', type: 'timestamptz', nullable: true })
  fechaRespuesta: Date | null;

  @Column({ name: 'motivo_rechazo', type: 'text', nullable: true })
  motivoRechazo: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Relation<Lead>;

  @ManyToOne(() => ProyectoTesis, { nullable: true })
  @JoinColumn({ name: 'id_proyecto' })
  proyecto: Relation<ProyectoTesis> | null;

  @ManyToOne(() => Conversacion, { nullable: true })
  @JoinColumn({ name: 'id_conversacion' })
  conversacion: Relation<Conversacion> | null;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: Relation<AgenteIa> | null;

  @ManyToOne(() => UsuarioInterno, { nullable: true })
  @JoinColumn({ name: 'id_usuario' })
  usuario: Relation<UsuarioInterno> | null;
}
