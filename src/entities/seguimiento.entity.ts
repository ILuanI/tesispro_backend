import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CanalContacto, EstadoSeguimiento } from '../common/enums/database.enums.js';
import { Propuesta } from './propuesta.entity.js';
import { Lead } from './lead.entity.js';
import { AgenteIa } from './agente-ia.entity.js';

@Entity('seguimiento')
export class Seguimiento {
  @PrimaryGeneratedColumn({ name: 'id_seguimiento', type: 'bigint' })
  idSeguimiento: string;

  @Column({ name: 'id_propuesta', type: 'bigint' })
  idPropuesta: string;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @Column({ name: 'nro_intento', type: 'smallint', default: 1 })
  nroIntento: number;

  @Column({ type: 'enum', enum: CanalContacto, enumName: 'canal_contacto', nullable: true })
  canal: CanalContacto | null;

  @Column({ type: 'enum', enum: EstadoSeguimiento, enumName: 'estado_seguimiento', default: EstadoSeguimiento.PROGRAMADO })
  estado: EstadoSeguimiento;

  @Column({ name: 'fecha_programada', type: 'timestamptz' })
  fechaProgramada: Date;

  @Column({ name: 'fecha_envio', type: 'timestamptz', nullable: true })
  fechaEnvio: Date | null;

  @Column({ type: 'text', nullable: true })
  mensaje: string | null;

  @Column({ type: 'text', nullable: true })
  resultado: string | null;

  @Column({ name: 'generado_por_ia', type: 'boolean', default: true })
  generadoPorIa: boolean;

  @ManyToOne(() => Propuesta)
  @JoinColumn({ name: 'id_propuesta' })
  propuesta: Relation<Propuesta>;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Relation<Lead>;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: Relation<AgenteIa> | null;
}
