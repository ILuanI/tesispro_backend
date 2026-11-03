import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ReferralCodeDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{8,30}$/) codigo: string;
}
export class EnableReferralDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(2147483647) idCliente: number;
}
export class ReferralStatusDto {
  @IsBoolean() activo: boolean;
}
export class ReferralListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10;
  @IsOptional() @IsString() @MaxLength(150) q?: string;
  @IsOptional() @IsIn(['activo', 'inactivo']) estado?: string;
  @IsOptional()
  @IsIn(['buyer', 'lead', 'contrato', 'payer', 'cliente'])
  comercial?: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;
}
