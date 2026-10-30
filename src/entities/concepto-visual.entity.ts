import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TipoConceptoVisual } from '../common/enums/database.enums.js';
import { AgenteIa } from './agente-ia.entity.js';
import { UsuarioInterno } from './usuario-interno.entity.js';

@Entity('concepto_visual')
export class ConceptoVisual {
  @PrimaryGeneratedColumn({ name: 'id_concepto' })
  idConcepto: number;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @Column({ type: 'enum', enum: TipoConceptoVisual, enumName: 'tipo_concepto_visual' })
  tipo: TipoConceptoVisual;

  @Column({ type: 'varchar', length: 100 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'jsonb', nullable: true })
  valor: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: false })
  aprobado: boolean;

  @Column({ name: 'aprobado_por', nullable: true })
  aprobadoPor: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: Relation<AgenteIa> | null;

  @ManyToOne(() => UsuarioInterno, { nullable: true })
  @JoinColumn({ name: 'aprobado_por' })
  aprobador: Relation<UsuarioInterno> | null;
}
