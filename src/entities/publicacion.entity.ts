import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoPublicacion, TipoContenido } from '../common/enums/database.enums.js';
import { CuentaRedSocial } from './cuenta-red-social.entity.js';
import { Campana } from './campana.entity.js';
import { ConceptoVisual } from './concepto-visual.entity.js';
import { AgenteIa } from './agente-ia.entity.js';

@Entity('publicacion')
export class Publicacion {
  @PrimaryGeneratedColumn({ name: 'id_publicacion' })
  idPublicacion: number;

  @Column({ name: 'id_cuenta' })
  idCuenta: number;

  @Column({ name: 'id_campana', nullable: true })
  idCampana: number | null;

  @Column({ name: 'id_concepto', nullable: true })
  idConcepto: number | null;

  @Column({ name: 'id_agente', nullable: true })
  idAgente: number | null;

  @Column({ name: 'tipo_contenido', type: 'enum', enum: TipoContenido, enumName: 'tipo_contenido' })
  tipoContenido: TipoContenido;

  @Column({ type: 'varchar', length: 200, nullable: true })
  titulo: string | null;

  @Column({ type: 'text', nullable: true })
  texto: string | null;

  @Column({ name: 'llamado_accion', type: 'varchar', length: 200, nullable: true })
  llamadoAccion: string | null;

  @Column({ type: 'enum', enum: EstadoPublicacion, enumName: 'estado_publicacion', default: EstadoPublicacion.IDEA })
  estado: EstadoPublicacion;

  @Column({ name: 'fecha_programada', type: 'timestamptz', nullable: true })
  fechaProgramada: Date | null;

  @Column({ name: 'fecha_publicacion', type: 'timestamptz', nullable: true })
  fechaPublicacion: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  url: string | null;

  @Column({ type: 'int', default: 0 })
  impresiones: number;

  @Column({ type: 'int', default: 0 })
  alcance: number;

  @Column({ type: 'int', default: 0 })
  likes: number;

  @Column({ type: 'int', default: 0 })
  comentarios: number;

  @Column({ type: 'int', default: 0 })
  compartidos: number;

  @Column({ type: 'int', default: 0 })
  clics: number;

  @Column({ name: 'generada_por_ia', type: 'boolean', default: false })
  generadaPorIa: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => CuentaRedSocial, (cuenta) => cuenta.publicaciones)
  @JoinColumn({ name: 'id_cuenta' })
  cuenta: Relation<CuentaRedSocial>;

  @ManyToOne(() => Campana, { nullable: true })
  @JoinColumn({ name: 'id_campana' })
  campana: Relation<Campana> | null;

  @ManyToOne(() => ConceptoVisual, { nullable: true })
  @JoinColumn({ name: 'id_concepto' })
  concepto: Relation<ConceptoVisual> | null;

  @ManyToOne(() => AgenteIa, { nullable: true })
  @JoinColumn({ name: 'id_agente' })
  agente: Relation<AgenteIa> | null;
}
