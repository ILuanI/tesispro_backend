import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CronogramaDto, PreviewDto } from './admin.dto.js';

export class PaymentPhaseDto {
  @IsInt() @Min(1) @Max(10000) porcentaje: number;
  @IsInt() @Min(0) @Max(3650) dias: number;
  @IsString() @MaxLength(300) nombre: string;
}
export class PaymentModeDto {
  @IsOptional() @IsInt() @Min(1) revision?: number;
  @IsString() @MaxLength(100) nombre: string;
  @IsIn(['unico', 'mensual', 'fases', 'personalizado']) tipo: string;
  @IsBoolean() activa: boolean;
  @IsInt() @Min(1) @Max(120) cantidad: number;
  @IsArray()
  @ArrayMaxSize(120)
  @ValidateNested({ each: true })
  @Type(() => PaymentPhaseDto)
  fases: PaymentPhaseDto[];
  @IsString() @MaxLength(3000) condiciones: string;
  @IsOptional() @IsIn(['primer_abono', 'primera_cuota']) reglaActivacion?:
    string | null;
}
export class SchedulePreviewDto extends PreviewDto {
  @IsOptional() @IsInt() @Min(1) idModalidad?: number;
}
export class ScheduleActionDto {
  @IsInt() @Min(1) revision: number;
  @IsIn(['solicitar', 'aprobar']) accion: string;
  @IsOptional() @IsString() @MaxLength(3000) motivo?: string;
}
export class DeliveryDto {
  @IsIn(['pendiente', 'en_progreso', 'entregado']) estado: string;
}
export { CronogramaDto };
