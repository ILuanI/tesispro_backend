import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class PaymentDecisionDto {
  @IsIn(['confirmado', 'rechazado']) estado: 'confirmado' | 'rechazado';
  @IsString() @MinLength(1) @MaxLength(3000) motivo: string;
  @IsUUID() claveIdempotencia: string;
}
export class RectificationDto {
  @IsString() @MinLength(1) @MaxLength(3000) motivo: string;
  @IsUUID() claveIdempotencia: string;
}
export class PaymentListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10;
  @IsOptional() @IsIn(['pendiente', 'confirmado', 'rechazado']) estado?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) contrato?: number;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['true', 'false']) incidencias?: string;
}
