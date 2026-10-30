import type { Relation } from 'typeorm';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { CanalContacto, ModalidadServicio } from '../common/enums/database.enums.js';
import { SesionLanding } from './sesion-landing.entity.js';
import { EstadoLead } from './estado-lead.entity.js';
import { UsuarioInterno } from './usuario-interno.entity.js';

@Entity('lead')
export class Lead {
  @PrimaryGeneratedColumn({ name: 'id_lead', type: 'bigint' })
  idLead: string;

  @Column({ name: 'id_sesion_origen', type: 'bigint', nullable: true })
  idSesionOrigen: string | null;

  @Column({ name: 'id_estado', type: 'smallint' })
  idEstado: number;

  @Column({ name: 'id_responsable', nullable: true })
  idResponsable: number | null;

  @Column({ type: 'varchar', length: 100 })
  nombres: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  apellidos: string | null;

  @Column({ type: 'varchar', length: 150, unique: true })
  correo: string;

  @Column({ type: 'varchar', length: 20 })
  telefono: string;

  @Column({ name: 'fecha_nacimiento', type: 'date', nullable: true })
  fechaNacimiento: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  departamento: string | null;

  @Column({ name: 'canal_preferido', type: 'enum', enum: CanalContacto, enumName: 'canal_contacto', nullable: true })
  canalPreferido: CanalContacto | null;

  @Column({ name: 'horario_preferido', type: 'varchar', length: 80, nullable: true })
  horarioPreferido: string | null;

  @Column({ name: 'modalidad_preferida', type: 'enum', enum: ModalidadServicio, enumName: 'modalidad_servicio', nullable: true })
  modalidadPreferida: ModalidadServicio | null;

  @Column({ name: 'cumple_perfil_objetivo', type: 'boolean', default: false })
  cumplePerfilObjetivo: boolean;

  @Column({ name: 'nivel_interes', type: 'smallint', nullable: true })
  nivelInteres: number | null;

  @CreateDateColumn({ name: 'fecha_registro', type: 'timestamptz' })
  fechaRegistro: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => SesionLanding, { nullable: true })
  @JoinColumn({ name: 'id_sesion_origen' })
  sesionOrigen: Relation<SesionLanding> | null;

  @ManyToOne(() => EstadoLead)
  @JoinColumn({ name: 'id_estado' })
  estado: Relation<EstadoLead>;

  @ManyToOne(() => UsuarioInterno, { nullable: true })
  @JoinColumn({ name: 'id_responsable' })
  responsable: Relation<UsuarioInterno> | null;
}
