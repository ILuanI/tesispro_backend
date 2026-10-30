import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TipoAgente } from '../common/enums/database.enums.js';

@Entity('agente_ia')
export class AgenteIa {
  @PrimaryGeneratedColumn({ name: 'id_agente' })
  idAgente: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  nombre: string;

  @Column({ type: 'enum', enum: TipoAgente, enumName: 'tipo_agente' })
  tipo: TipoAgente;

  @Column({ type: 'varchar', length: 80, nullable: true })
  modelo: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  version: string | null;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;
}
