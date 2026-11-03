import { BadRequestException } from '@nestjs/common';
import type { JourneyFilterDto } from './journeys.dto.js';

export function journeyConditions(
  dto: JourneyFilterDto,
  values: unknown[],
  alias = 's',
) {
  const clauses: string[] = [];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    clauses.push(sql.replaceAll('?', `$${values.length}`));
  };
  if (
    dto.actividadDesde &&
    dto.actividadHasta &&
    dto.actividadDesde > dto.actividadHasta
  )
    throw new BadRequestException('Rango de actividad inválido.');
  if (dto.recurso) add(`${alias}.id_recurso=?`, dto.recurso);
  if (dto.procedencia) add(`${alias}.canal=?`, dto.procedencia);
  if (dto.campana)
    add(
      `${alias}.campana ILIKE ?`,
      `%${dto.campana.replace(/[\\%_]/g, '\\$&')}%`,
    );
  if (dto.actividadDesde)
    add(
      `${alias}.created_at >= (?::date::timestamp AT TIME ZONE 'America/Lima')`,
      dto.actividadDesde,
    );
  if (dto.actividadHasta)
    add(
      `${alias}.created_at < ((?::date+1)::timestamp AT TIME ZONE 'America/Lima')`,
      dto.actividadHasta,
    );
  const event = (type: string) =>
    `EXISTS(SELECT 1 FROM evento_recurso ev WHERE ev.id_solicitud=${alias}.id_solicitud AND ev.tipo='${type}')`;
  if (dto.descarga === 'sin_accion')
    clauses.push(`NOT ${event('descarga_solicitada')}`);
  if (dto.descarga === 'solicitada') clauses.push(event('descarga_solicitada'));
  if (dto.descarga === 'entregada') clauses.push(event('archivo_entregado'));
  if (dto.descarga === 'externo') clauses.push(event('enlace_externo_abierto'));
  if (dto.reunion === 'sin_agendar')
    clauses.push(`NOT ${event('clic_agendar')}`);
  if (dto.reunion === 'pendiente')
    clauses.push(
      `${event('clic_agendar')} AND NOT EXISTS(SELECT 1 FROM reunion re WHERE re.id_solicitud=${alias}.id_solicitud)`,
    );
  if (dto.reunion === 'confirmada')
    clauses.push(
      `EXISTS(SELECT 1 FROM reunion re WHERE re.id_solicitud=${alias}.id_solicitud AND re.estado='confirmada')`,
    );
  if (dto.reunion === 'cancelada')
    clauses.push(
      `EXISTS(SELECT 1 FROM reunion re WHERE re.id_solicitud=${alias}.id_solicitud AND re.estado='cancelada') AND NOT EXISTS(SELECT 1 FROM reunion re WHERE re.id_solicitud=${alias}.id_solicitud AND re.estado='confirmada')`,
    );
  return clauses;
}
export function profileJourneyFilter(
  dto: JourneyFilterDto,
  values: unknown[],
  owner: string,
  kind: 'buyer' | 'lead',
) {
  const clauses = journeyConditions(dto, values);
  return clauses.length
    ? `EXISTS(SELECT 1 FROM solicitud_recurso s WHERE s.id_${kind}=${owner} AND ${clauses.join(' AND ')})`
    : '';
}
