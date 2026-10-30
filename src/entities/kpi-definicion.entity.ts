import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('kpi_definicion')
export class KpiDefinicion {
  @PrimaryGeneratedColumn({ name: 'id_kpi' })
  idKpi: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'smallint' })
  fase: number;

  @Column({ type: 'text', nullable: true })
  formula: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  unidad: string | null;

  @Column({ name: 'umbral_rojo', type: 'decimal', precision: 10, scale: 2 })
  umbralRojo: string;

  @Column({ name: 'umbral_verde', type: 'decimal', precision: 10, scale: 2 })
  umbralVerde: string;

  @Column({ name: 'mayor_es_mejor', type: 'boolean', default: true })
  mayorEsMejor: boolean;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;
}
