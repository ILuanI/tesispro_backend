import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { GeneralMeetingDto } from './lead-profile.dto.js';

export class CalendarConfigDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @MinLength(3) @MaxLength(300) calendarId: string;
}
export class CalendarRangeDto {
  @IsISO8601({ strict: true }) @Matches(/(Z|[+-]\d{2}:\d{2})$/) desde: string;
  @IsISO8601({ strict: true }) @Matches(/(Z|[+-]\d{2}:\d{2})$/) hasta: string;
}
export class CalendarCreateDto extends GeneralMeetingDto {}
export class CalendarMoveDto {
  @IsISO8601({ strict: true }) @Matches(/(Z|[+-]\d{2}:\d{2})$/) fechaInicio: string;
}
export class CalendarMeetDto {
  @IsOptional() @IsString() @Matches(/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/) meetUrl?: string;
}
