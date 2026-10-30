import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Propuesta } from './propuesta.entity.js';
import { Lead } from './lead.entity.js';

@Entity('contrato')
export class Contrato {
  @PrimaryGeneratedColumn({ name: 'id_contrato' })
  idContrato: number;

  @Column({ name: 'id_propuesta', type: 'bigint', unique: true })
  idPropuesta: string;

  @Column({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'version_clausulas', type: 'varchar', length: 20, default: '1.0' })
  versionClausulas: string;

  @Column({ name: 'acepta_autoria_estudiante', type: 'boolean', default: true })
  aceptaAutoriaEstudiante: boolean;

  @Column({ name: 'archivo_url', type: 'text', nullable: true })
  archivoUrl: string | null;

  @CreateDateColumn({ name: 'fecha_firma', type: 'timestamptz' })
  fechaFirma: Date;

  @ManyToOne(() => Propuesta)
  @JoinColumn({ name: 'id_propuesta' })
  propuesta: Relation<Propuesta>;

  @ManyToOne(() => Lead)
  @JoinColumn({ name: 'id_lead' })
  lead: Relation<Lead>;
}
