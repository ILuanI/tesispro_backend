import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Facultad } from './facultad.entity.js';
import { GradoAcademico } from './grado-academico.entity.js';

@Entity('directiva_tesis')
export class DirectivaTesis {
  @PrimaryGeneratedColumn({ name: 'id_directiva' })
  idDirectiva: number;

  @Column({ name: 'id_facultad' })
  idFacultad: number;

  @Column({ name: 'id_grado', type: 'smallint' })
  idGrado: number;

  @Column({ type: 'varchar', length: 20, default: '1.0' })
  version: string;

  @Column({ name: 'estructura_tesis', type: 'jsonb', nullable: true })
  estructuraTesis: Record<string, unknown> | null;

  @Column({ name: 'formato_caratula_url', type: 'text', nullable: true })
  formatoCaratulaUrl: string | null;

  @Column({ name: 'esquema_documentario', type: 'jsonb', nullable: true })
  esquemaDocumentario: Record<string, unknown> | null;

  @Column({ name: 'umbral_similitud_pct', type: 'decimal', precision: 5, scale: 2, nullable: true })
  umbralSimilitudPct: string | null;

  @Column({ name: 'exige_deteccion_ia', type: 'boolean', default: false })
  exigeDeteccionIa: boolean;

  @Column({ name: 'documento_url', type: 'text', nullable: true })
  documentoUrl: string | null;

  @Column({ name: 'vigente_desde', type: 'date', nullable: true })
  vigenteDesde: string | null;

  @Column({ name: 'vigente_hasta', type: 'date', nullable: true })
  vigenteHasta: string | null;

  @Column({ type: 'boolean', default: true })
  vigente: boolean;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @ManyToOne(() => Facultad)
  @JoinColumn({ name: 'id_facultad' })
  facultad: Relation<Facultad>;

  @ManyToOne(() => GradoAcademico)
  @JoinColumn({ name: 'id_grado' })
  grado: Relation<GradoAcademico>;
}
