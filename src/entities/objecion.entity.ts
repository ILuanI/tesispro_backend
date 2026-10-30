import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TipoObjecion } from '../common/enums/database.enums.js';

@Entity('objecion')
export class Objecion {
  @PrimaryGeneratedColumn({ name: 'id_objecion' })
  idObjecion: number;

  @Column({ type: 'enum', enum: TipoObjecion, enumName: 'tipo_objecion' })
  tipo: TipoObjecion;

  @Column({ type: 'varchar', length: 250 })
  descripcion: string;

  @Column({ name: 'respuesta_sugerida', type: 'text', nullable: true })
  respuestaSugerida: string | null;

  @Column({ type: 'boolean', default: true })
  activa: boolean;
}
