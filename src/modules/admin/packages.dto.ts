import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class PackageComponentDto {
  @IsInt() @Min(1) @Max(2147483647) idServicio: number;
  @IsInt() @Min(1) @Max(1000) cantidad: number;
}
export class PackageDto {
  @Transform(trim) @Matches(/^[A-Za-z0-9][A-Za-z0-9_-]{1,29}$/) codigo: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(150) nombre: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(3000) descripcion?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) publicoObjetivo?:
    string | null;
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PackageComponentDto)
  componentes: PackageComponentDto[];
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(500, { each: true })
  entregables: string[];
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(500, { each: true })
  restricciones: string[];
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/)
  precioFijo?: string | null;
  @IsIn(['PEN', 'USD', 'EUR']) moneda: string;
  @IsIn(['virtual', 'presencial', 'hibrida']) modalidad: string;
  @IsOptional() @IsInt() @Min(1) @Max(3650) duracionDias?: number | null;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  vigenciaDesde?: string | null;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  vigenciaHasta?: string | null;
  @IsIn(['borrador', 'activo', 'inactivo']) estado: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class PackageStatusDto {
  @IsInt() @Min(1) version: number;
  @IsIn(['borrador', 'activo', 'inactivo']) estado: string;
}
export class PackageListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(150) q?: string;
  @IsOptional() @IsIn(['borrador', 'activo', 'inactivo']) estado?: string;
  @IsOptional() @Matches(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/) precioMin?: string;
  @IsOptional() @Matches(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/) precioMax?: string;
  @IsOptional() @IsIn(['vigente', 'futuro', 'vencido']) vigencia?: string;
}
