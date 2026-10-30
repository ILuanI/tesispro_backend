import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('campana')
export class Campana {
  @PrimaryGeneratedColumn({ name: 'id_campana' })
  idCampana: number;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  objetivo: string | null;

  @Column({ name: 'fecha_inicio', type: 'date', nullable: true })
  fechaInicio: string | null;

  @Column({ name: 'fecha_fin', type: 'date', nullable: true })
  fechaFin: string | null;

  @Column({ name: 'utm_campaign', type: 'varchar', length: 100, unique: true, nullable: true })
  utmCampaign: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  presupuesto: string | null;

  @Column({ type: 'boolean', default: true })
  activa: boolean;
}
