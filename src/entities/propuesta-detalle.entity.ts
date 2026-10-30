import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Propuesta } from './propuesta.entity.js';
import { Servicio } from './servicio.entity.js';
import { EtapaTesis } from './etapa-tesis.entity.js';

@Entity('propuesta_detalle')
export class PropuestaDetalle {
  @PrimaryGeneratedColumn({ name: 'id_detalle', type: 'bigint' })
  idDetalle: string;

  @Column({ name: 'id_propuesta', type: 'bigint' })
  idPropuesta: string;

  @Column({ name: 'id_servicio' })
  idServicio: number;

  @Column({ name: 'id_etapa', nullable: true })
  idEtapa: number | null;

  @Column({ type: 'varchar', length: 250, nullable: true })
  descripcion: string | null;

  @Column({ type: 'smallint', default: 1 })
  cantidad: number;

  @Column({ name: 'precio_unitario', type: 'decimal', precision: 10, scale: 2 })
  precioUnitario: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  descuento: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, insert: false, update: false, nullable: true })
  subtotal: string | null;

  @ManyToOne(() => Propuesta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_propuesta' })
  propuesta: Relation<Propuesta>;

  @ManyToOne(() => Servicio)
  @JoinColumn({ name: 'id_servicio' })
  servicio: Relation<Servicio>;

  @ManyToOne(() => EtapaTesis, { nullable: true })
  @JoinColumn({ name: 'id_etapa' })
  etapa: Relation<EtapaTesis> | null;
}
