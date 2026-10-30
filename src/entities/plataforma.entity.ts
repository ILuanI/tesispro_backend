import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { CuentaRedSocial } from './cuenta-red-social.entity.js';

@Entity('plataforma')
export class Plataforma {
  @PrimaryGeneratedColumn({ name: 'id_plataforma' })
  idPlataforma: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  nombre: string;

  @OneToMany(() => CuentaRedSocial, (cuenta) => cuenta.plataforma)
  cuentas: CuentaRedSocial[];
}
