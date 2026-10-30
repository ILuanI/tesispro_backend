import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Lead } from './lead.entity.js';

@Entity('consentimiento_datos')
export class ConsentimientoDatos {
  @PrimaryGeneratedColumn({ name: 'id_consentimiento' })
  idConsentimiento: number;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ type: 'varchar', length: 100 })
  finalidad: string;

  @Column({ type: 'boolean' })
  aceptado: boolean;

  @Column({ name: 'version_politica', type: 'varchar', length: 20, nullable: true })
  versionPolitica: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha: Date;

  @Column({ type: 'inet', nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  medio: string | null;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Relation<Lead>;
}
