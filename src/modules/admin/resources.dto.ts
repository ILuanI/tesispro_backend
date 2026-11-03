import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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
} from 'class-validator';

export const resourceCategories = [
  { value: 'asesoria_academica', label: 'Asesoría académica' },
  {
    value: 'metodologia_investigacion',
    label: 'Metodología de investigación',
  },
  { value: 'guias_universitarias', label: 'Guías universitarias' },
  { value: 'material_propio', label: 'Material propio' },
];
export const resourceFormats = [
  { value: 'pdf', label: 'PDF' },
  { value: 'word', label: 'Word' },
  { value: 'video', label: 'Video' },
  { value: 'png', label: 'PNG' },
];
const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const nullableId = ({ value }: { value: unknown }) =>
  value === '' || value === null ? null : Number(value);

export class ResourceListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() @MaxLength(150) q?: string;
  @IsOptional()
  @IsIn(resourceCategories.map((c) => c.value))
  categoria?: string;
  @IsOptional() @IsIn(resourceFormats.map((f) => f.value)) formato?: string;
  @IsOptional() @IsIn(['true', 'false']) activo?: string;
  @IsOptional() @IsIn(['true', 'false']) publicado?: string;
  @IsOptional() @IsIn(['true', 'false']) destacado?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idEtapa?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  idGrado?: number;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  desde?: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  hasta?: string;
  @IsOptional()
  @IsIn([
    'titulo',
    'fechaCreacion',
    'fechaActualizacion',
    'categoria',
    'formato',
  ])
  sort = 'fechaCreacion';
  @IsOptional() @IsIn(['asc', 'desc']) direction = 'desc';
}
export class ResourceDto {
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  publicado?: boolean;
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  destacado?: boolean;
  @Transform(trimmed) @IsString() @MinLength(1) @MaxLength(200) titulo: string;
  @IsOptional() @Transform(trimmed) @IsString() @MaxLength(5000) descripcion?:
    string | null;
  @IsIn(resourceCategories.map((c) => c.value)) categoria: string;
  @IsIn(resourceFormats.map((f) => f.value)) formato: string;
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  activo: boolean;
  @Transform(nullableId)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  idEtapa?: number | null;
  @Transform(nullableId) @IsOptional() @IsInt() @Min(1) @Max(32767) idGrado?:
    number | null;
  @Transform(({ value }) => (value === '' ? null : value))
  @IsOptional()
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2000)
  archivoUrl?: string | null;
}
export class ResourceStatusDto {
  @IsBoolean() activo: boolean;
}
