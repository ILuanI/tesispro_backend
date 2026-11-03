import {
  AcademicProfileDto,
  WorkProfileDto,
  ThesisProjectDto,
} from './lead-profile.dto.js';
import { Type } from 'class-transformer';
import { JourneyFilterDto } from './journeys.dto.js';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CanalContacto,
  ModalidadServicio,
  MetodoPago,
} from '../../common/enums/database.enums.js';

export class LoginDto {
  @IsEmail() @MaxLength(150) correo: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
}
export class ListDto extends JourneyFilterDto {
  @IsOptional() @IsString() @MaxLength(40) origen?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idEtapa?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idNecesidad?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10;
  @IsOptional() @IsString() @MaxLength(150) q?: string;
  @IsOptional() @IsIn(['asc', 'desc']) direction = 'desc';
  @IsOptional()
  @IsIn([
    'fechaRegistro',
    'nombres',
    'estado',
    'fechaVencimiento',
    'monto',
    'idContrato',
  ])
  sort?: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;
  @IsOptional()
  @IsString()
  @Matches(/^(\d+|pendiente|parcial|pagada)$/)
  estado?: string;
  @IsOptional() @Matches(/^(\d+|sin_asignar)$/) responsable?: string;
  @IsOptional() @IsEnum(CanalContacto) canal?: CanalContacto;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) contrato?: number;
  @IsOptional() @IsIn(['PEN', 'USD', 'EUR']) moneda?: string;
  @IsOptional() @IsIn(['true', 'false']) vencida?: string;
  @IsOptional() @IsIn(['true', 'false']) venceHoy?: string;
}
export class LeadDto {
  @IsOptional() @IsInt() @Min(1) revision?: number;
  @IsOptional()
  @ValidateNested()
  @Type(() => AcademicProfileDto)
  perfilAcademico?: AcademicProfileDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkProfileDto)
  perfilLaboral?: WorkProfileDto;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ThesisProjectDto)
  proyectos?: ThesisProjectDto[];
  @IsOptional() @IsString() @MaxLength(100) nombres?: string | null;
  @IsOptional() @IsString() @MaxLength(100) apellidos?: string | null;
  @IsOptional() @IsEmail() @MaxLength(150) correo?: string | null;
  @IsOptional() @IsString() @MaxLength(25) telefono?: string | null;
  @IsOptional() @IsInt() @Min(1) idEstado?: number;
  @IsOptional() @IsInt() @Min(1) idResponsable?: number | null;
  @IsOptional() @IsString() @MaxLength(60) departamento?: string | null;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaNacimiento?: string | null;
  @IsOptional() @IsEnum(CanalContacto) canalPreferido?: CanalContacto | null;
  @IsOptional()
  @IsEnum(ModalidadServicio)
  modalidadPreferida?: ModalidadServicio | null;
  @IsOptional() @IsString() @MaxLength(80) horarioPreferido?: string | null;
  @IsOptional() @IsBoolean() cumplePerfilObjetivo?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(5) nivelInteres?: number | null;
  @IsOptional() @IsString() @MaxLength(500) motivo?: string;
}
export class ScheduleDeliverableDto {
  @IsString() @MinLength(1) @MaxLength(500) texto: string;
  @IsIn(['propuesta', 'adicional']) origen: 'propuesta' | 'adicional';
}
export class CuotaDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ScheduleDeliverableDto)
  entregables?: ScheduleDeliverableDto[];
  @IsInt() @Min(1) @Max(120) nroCuota: number;
  @IsString() @Matches(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/) monto: string;
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaVencimiento: string;
}
export class CronogramaDto {
  @IsOptional() @IsInt() @Min(1) idRectificacion?: number;
  @IsOptional() @IsInt() @Min(0) revision?: number;
  @IsOptional() @IsInt() @Min(1) idModalidad?: number;
  @IsOptional() @IsString() @MaxLength(3000) motivo?: string;
  @IsOptional() @IsString() @MaxLength(3000) condiciones?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => CuotaDto)
  cuotas: CuotaDto[];
}
export class PreviewDto {
  @IsOptional() @IsInt() @Min(1) idRectificacion?: number;
  @IsInt() @Min(1) @Max(120) cantidad: number;
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  primerVencimiento: string;
}
export class AbonoDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) idPagoOrigen?: number;
  @IsString() @Matches(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/) monto: string;
  @IsISO8601({ strict: true }) fechaPago: string;
  @IsEnum(MetodoPago) metodo: MetodoPago;
  @IsOptional() @IsString() @MaxLength(100) referenciaOperacion?: string;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  comprobanteUrl?: string;
  @IsUUID() claveIdempotencia: string;
}
export class ResolverPagoDto {
  @IsIn(['confirmado', 'rechazado']) estado: 'confirmado' | 'rechazado';
  @IsOptional() @IsISO8601({ strict: true }) fechaPago?: string;
}

export class KpiRangeDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;
}
