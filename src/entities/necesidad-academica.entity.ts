import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('necesidad_academica')
export class NecesidadAcademica {
  @PrimaryGeneratedColumn({ name: 'id_necesidad' })
  idNecesidad: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;
}
