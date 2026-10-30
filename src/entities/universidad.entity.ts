import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Facultad } from './facultad.entity.js';

@Entity('universidad')
export class Universidad {
  @PrimaryGeneratedColumn({ name: 'id_universidad' })
  idUniversidad: number;

  @Column({ type: 'varchar', length: 200, unique: true })
  nombre: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  siglas: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  tipoGestion: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  departamento: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  ciudad: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  sitioWeb: string | null;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => Facultad, (facultad) => facultad.universidad)
  facultades: Facultad[];
}
