import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsEmail,
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
import { buyerChannels } from './buyer-channels.js';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class AttributionDto {
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{24}$/) enlace?: string;
  @IsOptional() @IsIn(buyerChannels) canal?: string;
  @IsOptional() @IsString() @MaxLength(100) medio?: string;
  @IsOptional() @IsString() @MaxLength(100) campana?: string;
  @IsOptional() @IsString() @MaxLength(100) publicacion?: string;
}
export class CampaignLinkDto {
  @IsIn(buyerChannels) canal: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) medio: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) campana: string;
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  publicacion?: string;
}
export class ResourceContactDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) nombres: string;
  @IsString() @MaxLength(25) @MinLength(5) telefono: string;
  @Equals(true) consentimiento: boolean;
}
export class BookMeetingDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) nombres: string;
  @IsString() @MinLength(5) @MaxLength(25) telefono: string;
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(150)
  correo: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  universidad: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  descripcion: string;
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  fechaInicio: string;
}
export class AvailabilityDto {
  @IsISO8601({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) fecha: string;
}
export class JourneyFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  recurso?: number;
  @IsOptional() @IsIn(buyerChannels) procedencia?: string;
  @IsOptional() @IsString() @MaxLength(100) campana?: string;
  @IsOptional()
  @IsIn(['sin_accion', 'solicitada', 'entregada', 'externo'])
  descarga?: string;
  @IsOptional()
  @IsIn(['sin_agendar', 'pendiente', 'confirmada', 'cancelada'])
  reunion?: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  actividadDesde?: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  actividadHasta?: string;
}
export class JourneyListDto extends JourneyFilterDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,17}$/) buyer?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,17}$/) lead?: string;
}
export class MeetingListDto extends JourneyListDto {
  @IsOptional() @IsIn(['confirmada', 'cancelada']) estado?: string;
  @IsOptional() @IsString() @MaxLength(150) q?: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;
}
export class CancelMeetingDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) motivo: string;
}
