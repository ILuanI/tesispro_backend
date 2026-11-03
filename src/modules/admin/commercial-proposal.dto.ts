import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class CommercialServiceDto {
  @IsString() @Matches(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/) precio: string;
  @IsIn(['PEN','USD','EUR']) moneda: string;
  @IsBoolean() activo: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(3650) plazoDias?: number | null;
  @IsArray() @ArrayMaxSize(30) @IsString({each:true}) @MaxLength(500,{each:true}) entregables: string[];
  @IsString() @MaxLength(5000) condiciones: string;
  @IsInt() @Min(0) @Max(100) descuentoMax: number;
  @IsOptional() @IsInt() @Min(1) revision?: number;
}
export class ProposalLineDto {
  @IsInt() @Min(1) idServicio: number;
  @IsInt() @Min(1) @Max(1000) cantidad: number;
}
export class ProposalDraftDto {
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,18}$/) idConversacion?: string;
  @IsOptional() @IsInt() @Min(1) idPaquete?: number;
  @IsOptional() @IsInt() @Min(1) versionPaquete?: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @ValidateNested({each:true}) @Type(() => ProposalLineDto) componentes: ProposalLineDto[];
  @IsOptional() @IsInt() @Min(0) @Max(100) descuentoPorcentaje?: number;
  @IsOptional() @IsString() @MaxLength(5000) condicionesEspeciales?: string;
  @IsOptional() @IsString() @MaxLength(1000) motivoExcepcion?: string;
  @IsOptional() @IsString() @MaxLength(5000) textoManual?: string;
  @IsOptional() @IsInt() @Min(1) revision?: number;
}
export class ProposalActionDto {
  @IsInt() @Min(1) version: number;
  @IsIn(['aprobar_excepcion','revisar','presentar','aceptar','solicitar_cambios','rechazar']) accion: string;
  @IsOptional() @IsString() @MaxLength(3000) motivo?: string;
}
export class OptionalComponentsDto {
  @IsArray() @ArrayMaxSize(50) @IsInt({each:true}) @Min(1,{each:true}) servicios: number[];
}
export class IncompatibilityDto {
  @IsInt() @Min(1) primero: number;
  @IsInt() @Min(1) segundo: number;
  @IsBoolean() incompatible: boolean;
}
