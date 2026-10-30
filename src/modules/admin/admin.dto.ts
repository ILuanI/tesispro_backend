import { Type } from 'class-transformer';
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
export class ListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
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
}
export class LeadDto {
  @IsString() @MinLength(1) @MaxLength(100) nombres: string;
  @IsOptional() @IsString() @MaxLength(100) apellidos?: string | null;
  @IsEmail() @MaxLength(150) correo: string;
  @IsString() @MinLength(5) @MaxLength(20) telefono: string;
  @IsInt() @Min(1) idEstado: number;
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
export class CuotaDto {
  @IsInt() @Min(1) @Max(120) nroCuota: number;
  @IsString() @Matches(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/) monto: string;
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaVencimiento: string;
}
export class CronogramaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => CuotaDto)
  cuotas: CuotaDto[];
}
export class PreviewDto {
  @IsInt() @Min(1) @Max(120) cantidad: number;
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  primerVencimiento: string;
}
export class AbonoDto {
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
