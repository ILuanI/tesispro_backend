import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TipoRemitente } from '../common/enums/database.enums.js';
import { Conversacion } from './conversacion.entity.js';
import { AgenteIa } from './agente-ia.entity.js';
import { UsuarioInterno } from './usuario-interno.entity.js';

@Entity('mensaje')
export class Mensaje {
  @PrimaryGeneratedColumn({ name: 'id_mensaje', type: 'bigint' })
  idMensaje: string;

  @Column({ name: 'id_conversacion', type: 'bigint' })
  idConversacion: string;

  @Column({ type: 'enum', enum: TipoRemitente, enumName: 'tipo_remitente' })
  remitente: TipoRemitente;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @Column({ name: 'id_usuario', nullable: true })
  idUsuario: number | null;

  @Column({ type: 'text' })
  contenido: string;

  @Column({ name: 'es_consulta_servicio', type: 'boolean', default: false })
  esConsultaServicio: boolean;

  @CreateDateColumn({ name: 'enviado_en', type: 'timestamptz' })
  enviadoEn: Date;

  @Column({ name: 'tiempo_respuesta_ms', type: 'int', nullable: true })
  tiempoRespuestaMs: number | null;

  @Column({ name: 'calificacion_positiva', type: 'boolean', nullable: true })
  calificacionPositiva: boolean | null;

  @ManyToOne(() => Conversacion, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_conversacion' })
  conversacion: Relation<Conversacion>;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: Relation<AgenteIa> | null;

  @ManyToOne(() => UsuarioInterno, { nullable: true })
  @JoinColumn({ name: 'id_usuario' })
  usuario: Relation<UsuarioInterno> | null;
}
