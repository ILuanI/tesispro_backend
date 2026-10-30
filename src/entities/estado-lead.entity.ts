import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('estado_lead')
export class EstadoLead {
  @PrimaryGeneratedColumn({ name: 'id_estado', type: 'smallint' })
  idEstado: number;

  @Column({ type: 'varchar', length: 30, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 60 })
  nombre: string;

  @Column({ type: 'smallint' })
  fase: number;

  @Column({ type: 'smallint' })
  orden: number;
}
