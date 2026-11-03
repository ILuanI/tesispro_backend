import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsEmail,
  IsEnum,
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
} from 'class-validator';
import { CondicionAcademica } from '../../common/enums/database.enums.js';

export { buyerChannels } from './buyer-channels.js';
import { buyerChannels } from './buyer-channels.js';
import { JourneyFilterDto } from './journeys.dto.js';
export const buyerReasons = [
  'descarga_recurso',
  'contenido',
  'consulta_general',
  'otro',
];
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class BuyerDto {
  @IsOptional() @IsInt() @Min(1) revision?: number;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) nombres?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) apellidos?:
    string | null;
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  correo?: string | null;
  @IsOptional() @Transform(trim) @IsString() @Matches(/^\+?[\d ()-]{5,25}$/) telefono?: string | null;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaNacimiento?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(120) edadDeclarada?: number | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60) departamento?:
    string | null;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) idUniversidad?: number | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) universidadOtra?:
    string | null;
  @IsOptional() @IsInt() @Min(1) @Max(32767) idGrado?: number | null;
  @IsOptional()
  @IsEnum(CondicionAcademica)
  condicion?: CondicionAcademica | null;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) idEtapa?: number | null;
  @IsIn(buyerChannels) canalOrigen: string;
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  fechaRegistro: string;
  @IsIn(buyerReasons) motivoCaptacion: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) recursoInteres?:
    string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(5000) notas?:
    string | null;
  @IsIn(['buyer', 'lead']) estado: string;
  @IsOptional() @IsInt() @Min(1) @Max(32767) idEstadoLead?: number;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  motivoConversion?: string;
}
export class BuyerListDto extends JourneyFilterDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10;
  @IsOptional() @IsString() @MaxLength(150) q?: string;
  @IsOptional() @IsIn(buyerChannels) canal?: string;
  @IsOptional() @IsIn(buyerReasons) motivoCaptacion?: string;
  @IsOptional() @IsIn(['buyer']) estado?: string;
  @IsOptional() @IsEnum(CondicionAcademica) condicion?: CondicionAcademica;
  @IsOptional() @IsString() @MaxLength(60) departamento?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idUniversidad?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  idGrado?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idEtapa?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(120) edadMin?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(120) edadMax?: number;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;
  @IsOptional()
  @IsIn(['fechaRegistro', 'nombres', 'edad', 'canalOrigen', 'departamento'])
  sort = 'fechaRegistro';
  @IsOptional() @IsIn(['asc', 'desc']) direction = 'desc';
}
export class CaptureBuyerDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) nombres: string;
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(150)
  correo: string;
  @Transform(trim) @IsString() @Matches(/^\+?[\d ()-]{5,20}$/) telefono: string;
  @IsIn(buyerChannels) canalOrigen: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  recursoInteres: string;
  @Equals(true) consentimiento: boolean;
}
