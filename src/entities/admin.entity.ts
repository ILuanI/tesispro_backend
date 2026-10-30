import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';

@Entity('cronograma_pago')
export class CronogramaPago {
  @PrimaryGeneratedColumn({ name: 'id_cronograma' }) idCronograma: number;
  @Index({ unique: true }) @Column({ name: 'id_contrato' }) idContrato: number;
  @Column({
    name: 'monto_programado',
    type: 'decimal',
    precision: 10,
    scale: 2,
  })
  montoProgramado: string;
  @Column({ name: 'cobros_previos', type: 'decimal', precision: 10, scale: 2 })
  cobrosPrevios: string;
  @Column({ type: 'char', length: 3 }) moneda: string;
  @Column({ name: 'id_usuario' }) idUsuario: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('cuota_pago')
@Index(['idCronograma', 'nroCuota'], { unique: true })
export class CuotaPago {
  @PrimaryGeneratedColumn({ name: 'id_cuota' }) idCuota: number;
  @Column({ name: 'id_cronograma' }) idCronograma: number;
  @Column({ name: 'nro_cuota', type: 'smallint' }) nroCuota: number;
  @Column({ type: 'decimal', precision: 10, scale: 2 }) monto: string;
  @Column({ name: 'fecha_vencimiento', type: 'date' }) fechaVencimiento: string;
}

@Entity('sesion_admin')
export class SesionAdmin {
  @Column({ name: 'token_hash', type: 'varchar', length: 64, primary: true })
  tokenHash: string;
  @Column({ name: 'id_usuario' }) idUsuario: number;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
}
