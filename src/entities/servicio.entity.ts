import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ModeloCobro, ModalidadServicio } from '../common/enums/database.enums.js';
import { GradoAcademico } from './grado-academico.entity.js';

@Entity('servicio')
export class Servicio {
  @PrimaryGeneratedColumn({ name: 'id_servicio' })
  idServicio: number;

  @Column({ type: 'varchar', length: 30, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ name: 'id_grado', type: 'smallint', nullable: true })
  idGrado: number | null;

  @Column({ name: 'modelo_cobro', type: 'enum', enum: ModeloCobro, enumName: 'modelo_cobro', default: ModeloCobro.PAGO_UNICO })
  modeloCobro: ModeloCobro;

  @Column({ type: 'enum', enum: ModalidadServicio, enumName: 'modalidad_servicio', default: ModalidadServicio.VIRTUAL })
  modalidad: ModalidadServicio;

  @Column({ type: 'text', nullable: true })
  alcance: string | null;

  @Column({ name: 'duracion_dias', type: 'int', nullable: true })
  duracionDias: number | null;

  @Column({ name: 'precio_base', type: 'decimal', precision: 10, scale: 2 })
  precioBase: string;

  @Column({ type: 'char', length: 3, default: 'PEN' })
  moneda: string;

  @Column({ name: 'incluye_control_similitud', type: 'boolean', default: true })
  incluyeControlSimilitud: boolean;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @ManyToOne(() => GradoAcademico, { nullable: true })
  @JoinColumn({ name: 'id_grado' })
  grado: Relation<GradoAcademico> | null;
}
