import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Plataforma } from './plataforma.entity.js';
import { Publicacion } from './publicacion.entity.js';

@Entity('cuenta_red_social')
export class CuentaRedSocial {
  @PrimaryGeneratedColumn({ name: 'id_cuenta' })
  idCuenta: number;

  @Column({ name: 'id_plataforma' })
  idPlataforma: number;

  @Column({ name: 'nombre_usuario', type: 'varchar', length: 100 })
  nombreUsuario: string;

  @Column({ type: 'varchar', length: 250, nullable: true })
  url: string | null;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @ManyToOne(() => Plataforma, (plataforma) => plataforma.cuentas)
  @JoinColumn({ name: 'id_plataforma' })
  plataforma: Relation<Plataforma>;

  @OneToMany(() => Publicacion, (publicacion) => publicacion.cuenta)
  publicaciones: Publicacion[];
}
