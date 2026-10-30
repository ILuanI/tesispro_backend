import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ModeloCobro } from '../common/enums/database.enums.js';

@Entity('grado_academico')
export class GradoAcademico {
  @PrimaryGeneratedColumn({ name: 'id_grado', type: 'smallint' })
  idGrado: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  codigo: string;

  @Column({ type: 'varchar', length: 60 })
  nombre: string;

  @Column({ name: 'modelo_cobro_sugerido', type: 'enum', enum: ModeloCobro, enumName: 'modelo_cobro', nullable: true })
  modeloCobroSugerido: ModeloCobro | null;

  @Column({ name: 'requiere_perfil_investigador', type: 'boolean', default: false })
  requierePerfilInvestigador: boolean;
}
