import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Semaforo } from '../common/enums/database.enums.js';
import { KpiDefinicion } from './kpi-definicion.entity.js';
import { Universidad } from './universidad.entity.js';
import { Campana } from './campana.entity.js';
import { AgenteIa } from './agente-ia.entity.js';

@Entity('kpi_medicion')
export class KpiMedicion {
  @PrimaryGeneratedColumn({ name: 'id_medicion', type: 'bigint' })
  idMedicion: string;

  @Column({ name: 'id_kpi' })
  idKpi: number;

  @Column({ name: 'periodo_inicio', type: 'date' })
  periodoInicio: string;

  @Column({ name: 'periodo_fin', type: 'date' })
  periodoFin: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  numerador: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  denominador: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  valor: string;

  @Column({ type: 'enum', enum: Semaforo, enumName: 'semaforo', nullable: true })
  semaforo: Semaforo | null;

  @Column({ name: 'id_universidad', nullable: true })
  idUniversidad: number | null;

  @Column({ name: 'id_campana', nullable: true })
  idCampana: number | null;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => KpiDefinicion)
  @JoinColumn({ name: 'id_kpi' })
  kpi: Relation<KpiDefinicion>;

  @ManyToOne(() => Universidad, { nullable: true })
  @JoinColumn({ name: 'id_universidad' })
  universidad: Relation<Universidad> | null;

  @ManyToOne(() => Campana, { nullable: true })
  @JoinColumn({ name: 'id_campana' })
  campana: Relation<Campana> | null;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: Relation<AgenteIa> | null;
}
