import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsDefined,
  IsObject,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ModalidadServicio } from '../../common/enums/database.enums.js';
import { ListDto } from './admin.dto.js';

export class ContractListDto extends ListDto {
  @IsOptional() @IsIn(['con', 'sin']) planificacion?: string;
}
export class ContractLineDto {
  @IsInt() @Min(1) idServicio: number;
  @IsOptional() @IsInt() @Min(1) idEtapa?: number | null;
  @IsOptional() @IsString() @MaxLength(250) descripcion?: string | null;
  @IsInt() @Min(1) @Max(32767) cantidad: number;
  @IsString() @Matches(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/) precioUnitario: string;
  @IsString() @Matches(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/) descuento: string;
}
export class ContractTermsDto {
  @IsIn(['PEN', 'USD', 'EUR']) moneda: string;
  @IsEnum(ModalidadServicio) modalidad: ModalidadServicio;
  @IsOptional() @IsInt() @Min(1) @Max(3650) tiempoEntregaDias?: number | null;
  @IsOptional() @IsString() @MaxLength(10000) condiciones?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ContractLineDto)
  detalles: ContractLineDto[];
}
export class CreateContractDto {
  @IsString() @Matches(/^[1-9]\d{0,18}$/) idLead: string;
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ContractTermsDto)
  propuesta: ContractTermsDto;
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  fechaFirma: string;
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/\S/)
  versionClausulas: string;
  @Equals(true) aceptaAutoriaEstudiante: boolean;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  archivoUrl?: string | null;
}
export class UpdateContractDto {
  @ValidateIf((_o, value) => value !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => ContractTermsDto)
  propuesta?: ContractTermsDto;
  @ValidateIf((_o, value) => value !== undefined)
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  fechaFirma?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  @Matches(/\S/)
  versionClausulas?: string;
  @ValidateIf((_o, value) => value !== undefined)
  @Equals(true)
  aceptaAutoriaEstudiante?: boolean;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  archivoUrl?: string | null;
}
