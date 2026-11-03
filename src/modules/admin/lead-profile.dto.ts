import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CanalContacto,
  CondicionAcademica,
  EstadoSeguimiento,
} from '../../common/enums/database.enums.js';
import { AttributionDto } from './journeys.dto.js';

export class AcademicProfileDto {
  @IsOptional() @IsInt() @Min(1) idUniversidad?: number | null;
  @IsOptional() @IsString() @MaxLength(200) universidadOtra?: string | null;
  @IsOptional() @IsInt() @Min(1) idFacultad?: number | null;
  @IsOptional() @IsInt() @Min(1) idPrograma?: number | null;
  @IsOptional() @IsInt() @Min(1) idGrado?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(30) ciclo?: number | null;
  @IsOptional()
  @IsEnum(CondicionAcademica)
  condicion?: CondicionAcademica | null;
  @IsOptional() @IsInt() @Min(1900) @Max(2200) anioEgreso?: number | null;
}
export class WorkProfileDto {
  @IsOptional() @IsBoolean() trabaja?: boolean | null;
  @IsOptional() @IsString() @MaxLength(120) ocupacion?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(168) horasLibresSemana?: number | null;
}
export class ThesisProjectDto {
  @IsOptional() @IsInt() @Min(1) idProyecto?: number;
  @IsOptional() @IsString() @MaxLength(5000) tema?: string | null;
  @IsOptional() @IsInt() @Min(1) idEtapa?: number | null;
  @IsOptional() @IsInt() @Min(1) idServicioInteres?: number | null;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaLimite?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) observaciones?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  necesidades?: number[];
}
export class ProfilePageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
export class FollowUpDto {
  @IsInt() @Min(1) revision: number;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,18}$/) idPropuesta?:
    string | null;
  @IsOptional() @IsEnum(CanalContacto) canal?: CanalContacto | null;
  @IsOptional() @IsEnum(EstadoSeguimiento) estado?: EstadoSeguimiento;
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  fechaProgramada: string;
  @IsOptional() @IsString() @MaxLength(5000) mensaje?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) resultado?: string | null;
}
export class SuggestionDecisionDto {
  @IsInt() @Min(1) revision: number;
  @IsIn(['aceptar', 'rechazar']) accion: string;
  @IsOptional() @IsInt() @Min(1) idProyecto?: number;
  @IsOptional() @IsInt() @Min(1) idCatalogo?: number;
}
export class HandoffUpdateDto {
  @IsInt() @Min(1) revision: number;
  @IsIn(['pendiente', 'en_atencion', 'resuelta']) estado: string;
  @IsOptional() @IsInt() @Min(1) idUsuarioAsignado?: number | null;
  @IsOptional() @IsString() @MaxLength(5000) resolucion?: string | null;
}
export class CaptureProfileDto extends AttributionDto {
  @IsUUID() clave: string;
  @IsIn(['diagnostico', 'consulta', 'tesi']) fuente: string;
  @IsOptional() @IsString() @MaxLength(100) nombres?: string | null;
  @IsOptional() @IsEmail() @MaxLength(150) correo?: string | null;
  @IsOptional() @IsString() @MaxLength(25) telefono?: string | null;
  @IsOptional() @IsString() @MaxLength(200) universidad?: string;
  @IsOptional() @IsString() @MaxLength(160) grado?: string;
  @IsOptional() @IsString() @MaxLength(160) etapa?: string;
  @IsOptional() @IsString() @MaxLength(160) plazo?: string;
  @IsOptional() @IsString() @MaxLength(5000) descripcion?: string;
  @IsBoolean() consentimiento: boolean;
}
export class GeneralMeetingDto extends CaptureProfileDto {
  @IsString() @MaxLength(100) declare nombres: string;
  @IsString() @MaxLength(25) declare telefono: string;
  @IsEmail() @MaxLength(150) declare correo: string;
  @IsISO8601({ strict: true })
  @Matches(/(Z|[+-]\d{2}:\d{2})$/)
  fechaInicio: string;
}
export class TesiBeginDto {
  @IsUUID() idTurno: string;
  @IsString() @MaxLength(800) mensaje: string;
}
export class TesiFinishDto extends TesiBeginDto {
  @IsString() @MaxLength(2400) respuesta: string;
  @IsString() @MaxLength(15000) resultadoJson: string;
}
