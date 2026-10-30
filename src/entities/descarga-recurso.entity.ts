import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CanalContacto } from '../common/enums/database.enums.js';
import { RecursoGratuito } from './recurso-gratuito.entity.js';
import { Lead } from './lead.entity.js';
import { SesionLanding } from './sesion-landing.entity.js';

@Entity('descarga_recurso')
export class DescargaRecurso {
  @PrimaryGeneratedColumn({ name: 'id_descarga', type: 'bigint' })
  idDescarga: string;

  @Column({ name: 'id_recurso' })
  idRecurso: number;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'id_sesion', type: 'bigint', nullable: true })
  idSesion: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha: Date;

  @Column({ name: 'canal_entrega', type: 'enum', enum: CanalContacto, enumName: 'canal_contacto', nullable: true })
  canalEntrega: CanalContacto | null;

  @Column({ type: 'boolean', default: false })
  entregado: boolean;

  @ManyToOne(() => RecursoGratuito)
  @JoinColumn({ name: 'id_recurso' })
  recurso: Relation<RecursoGratuito>;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Relation<Lead>;

  @ManyToOne(() => SesionLanding, { nullable: true })
  @JoinColumn({ name: 'id_sesion' })
  sesion: Relation<SesionLanding> | null;
}
