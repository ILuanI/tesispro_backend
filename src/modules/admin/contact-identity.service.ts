import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';

export function normalizeContactPhone(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 9) digits = '51' + digits;
  if (!/^[1-9]\d{7,14}$/.test(digits))
    throw new BadRequestException(
      'Ingresa un teléfono válido con código de país.',
    );
  return '+' + digits;
}
@Injectable()
export class ContactIdentityService {
  async resolve(
    m: EntityManager,
    correo?: string | null,
    telefono?: string | null,
  ) {
    const keys = [
      correo?.trim() ? ['correo', correo.trim().toLowerCase()] : null,
      telefono?.trim() ? ['telefono', normalizeContactPhone(telefono)] : null,
    ].filter(Boolean) as string[][];
    keys.sort((a, b) => a.join(':').localeCompare(b.join(':')));
    if (!keys.length)
      throw new BadRequestException('Indica correo o WhatsApp.');
    for (const [tipo, valor] of keys)
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `contact:${tipo}:${valor}`,
      ]);
    const rows = await m.query(
      'SELECT * FROM contacto_identidad WHERE (tipo=$1 AND valor=$2) OR (tipo=$3 AND valor=$4)',
      [...keys[0]!, ...(keys[1] || [null, null])],
    );
    const owners = new Set(
      rows.map(
        (r: any) =>
          `${r.id_lead ? 'lead' : 'buyer'}:${r.id_lead || r.id_buyer}`,
      ),
    );
    if (owners.size > 1)
      throw new ConflictException(
        'Los datos de contacto no se pueden consolidar automáticamente. Solicita revisión administrativa.',
      );
    return rows[0] as
      { id_lead: string | null; id_buyer: string | null } | undefined;
  }
  async releaseBuyer(m: EntityManager, id: string) {
    const [b] = await m.query(
      'SELECT correo,telefono FROM buyer WHERE id_buyer=$1 FOR UPDATE',
      [id],
    );
    if (b) await this.resolve(m, b.correo, b.telefono);
    await m.query('DELETE FROM contacto_identidad WHERE id_buyer=$1', [id]);
  }
  async converted(m: EntityManager, buyer: string, lead: string) {
    await m.query('UPDATE calificacion_tesi SET id_lead=$1 WHERE id_buyer=$2', [lead, buyer]);
    await m.query('UPDATE derivacion_humana SET id_lead=$1 WHERE id_conversacion IN (SELECT id_conversacion FROM conversacion WHERE id_sesion IN (SELECT id_sesion FROM acceso_contacto WHERE id_buyer=$2))', [lead, buyer]);
    await m.query('UPDATE acceso_contacto SET id_lead=$1 WHERE id_buyer=$2', [
      lead,
      buyer,
    ]);
    await m.query('UPDATE evento_perfil SET id_lead=$1 WHERE id_buyer=$2', [
      lead,
      buyer,
    ]);
    await m.query('UPDATE sugerencia_perfil SET id_lead=$1 WHERE id_buyer=$2', [
      lead,
      buyer,
    ]);
    await m.query(
      'UPDATE conversacion SET id_lead=$1 WHERE id_sesion IN (SELECT id_sesion FROM acceso_contacto WHERE id_buyer=$2)',
      [lead, buyer],
    );
    await m.query(
      'UPDATE lead SET procedencia_campos=procedencia_campos || (SELECT procedencia_campos FROM buyer WHERE id_buyer=$2) WHERE id_lead=$1',
      [lead, buyer],
    );
  }
}
