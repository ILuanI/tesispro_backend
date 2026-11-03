import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import type { Request, Response } from 'express';
import type { ReferralListDto } from './referrals.dto.js';

export const referralDigest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const referralPhone = (value: string | null | undefined) => {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length === 9 ? `51${digits}` : digits;
};
export const referralCookie = (req: Request) =>
  (req.headers.cookie || '')
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith('tesispro_ref='))
    ?.slice(13) || '';
const commercial = `CASE WHEN EXISTS(SELECT 1 FROM cliente c WHERE c.id_lead=a.id_lead) THEN 'cliente'
  WHEN EXISTS(SELECT 1 FROM pago p WHERE p.id_lead=a.id_lead AND p.estado='confirmado') THEN 'payer'
  WHEN EXISTS(SELECT 1 FROM contrato c WHERE c.id_lead=a.id_lead) THEN 'contrato'
  WHEN a.id_lead IS NOT NULL THEN 'lead' ELSE 'buyer' END`;
const attribution = `SELECT a.id_atribucion AS "idAtribucion", a.id_buyer AS "idBuyer", a.id_lead AS "idLead",
  a.fecha_captacion AS "fechaCaptacion", e.codigo,e.id_referido AS "idReferido",
  concat_ws(' ',r.nombres,r.apellidos) AS referente,
  COALESCE(l.nombres,b.nombres) AS nombres, st.nombre AS "estadoLead",
  b.fecha_conversion AS "fechaLead", cl.fecha_conversion AS "fechaCliente", ${commercial} AS comercial,
  EXISTS(SELECT 1 FROM contrato ct WHERE ct.id_lead=a.id_lead) AS contratado,
  EXISTS(SELECT 1 FROM pago p WHERE p.id_lead=a.id_lead AND p.estado='confirmado') AS "pagoConfirmado"
  FROM atribucion_referido a JOIN enlace_referido e USING(id_referido)
  JOIN lead r ON r.id_lead=e.id_lead_referente
  LEFT JOIN buyer b ON b.id_buyer=a.id_buyer LEFT JOIN lead l ON l.id_lead=a.id_lead
  LEFT JOIN estado_lead st ON st.id_estado=l.id_estado LEFT JOIN cliente cl ON cl.id_lead=a.id_lead`;

@Injectable()
export class ReferralsService {
  constructor(private readonly db: DataSource) {}
  private readonly attempts = new Map<
    string,
    { count: number; until: number }
  >();
  limit(key: string) {
    const now = Date.now();
    for (const [ip, value] of this.attempts)
      if (value.until <= now) this.attempts.delete(ip);
    const item = this.attempts.get(key) || { count: 0, until: now + 60000 };
    if (item.count >= 30 || this.attempts.size >= 10000)
      throw new HttpException(
        'Espera un minuto antes de volver a intentarlo.',
        429,
      );
    item.count++;
    this.attempts.set(key, item);
  }
  days() {
    const days = Number(process.env.REFERRAL_TTL_DAYS || 30);
    return Number.isInteger(days) && days >= 1 && days <= 90 ? days : 30;
  }
  async establish(code: string, previous: string, res: Response) {
    // A previously issued context keeps its first touch until its original expiry.
    const [prior] = /^[a-f0-9]{64}$/.test(previous)
      ? await this.db.query(
          `SELECT 1 FROM contexto_referido WHERE token_hash=$1 AND expira_at>now()`,
          [referralDigest(previous)],
        )
      : [];
    if (prior) return { ok: true };
    const [link] = await this.db.query(
      `SELECT e.id_referido FROM enlace_referido e
      JOIN cliente c ON c.id_cliente=e.id_cliente AND c.id_lead=e.id_lead_referente
      WHERE e.codigo=$1 AND e.codigo ~ '^[a-f0-9]{30}$' AND e.activo AND c.activo`,
      [code],
    );
    if (!link) return { ok: true }; // No public enumeration or client data.
    const token = randomBytes(32).toString('hex');
    await this.db.query(
      `INSERT INTO contexto_referido(token_hash,id_referido,expira_at) VALUES($1,$2,now()+($3::int*interval '1 day'))`,
      [referralDigest(token), link.id_referido, this.days()],
    );
    res.cookie('tesispro_ref', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: this.days() * 86400000,
    });
    res.setHeader('Cache-Control', 'no-store');
    return { ok: true };
  }
  async attribute(m: EntityManager, token: string, buyerId: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) return;
    const [context] = await m.query(
      `SELECT e.* FROM contexto_referido x JOIN enlace_referido e USING(id_referido)
      JOIN cliente c ON c.id_cliente=e.id_cliente AND c.id_lead=e.id_lead_referente
      WHERE x.token_hash=$1 AND x.expira_at>now() AND e.activo AND c.activo FOR SHARE OF e,c`,
      [referralDigest(token)],
    );
    if (!context) return;
    const [b] = await m.query(
      'SELECT * FROM buyer WHERE id_buyer=$1 FOR UPDATE',
      [buyerId],
    );
    const [r] = await m.query(
      'SELECT correo,telefono FROM lead WHERE id_lead=$1',
      [context.id_lead_referente],
    );
    if (
      !b ||
      !r ||
      b.id_lead === context.id_lead_referente ||
      (b.correo &&
        r.correo &&
        b.correo.toLowerCase() === r.correo.toLowerCase()) ||
      (referralPhone(b.telefono) && referralPhone(b.telefono) === referralPhone(r.telefono))
    )
      return;
    await m.query(
      `INSERT INTO atribucion_referido(id_referido,id_buyer,id_lead) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
      [context.id_referido, buyerId, b.id_lead],
    );
    await m.query(
      `UPDATE sesion_landing SET id_referido=$1 WHERE id_sesion IN
      (SELECT id_sesion FROM solicitud_recurso WHERE id_buyer=$2) AND id_referido IS NULL`,
      [context.id_referido, buyerId],
    );
  }
  async clients(q = '') {
    return this.db.query(
      `SELECT c.id_cliente AS "idCliente", concat_ws(' ',l.nombres,l.apellidos) AS nombre
      FROM cliente c JOIN lead l USING(id_lead) WHERE c.activo AND
      (concat_ws(' ',l.nombres,l.apellidos) ILIKE $1 OR c.id_cliente::text=$2) ORDER BY l.nombres,c.id_cliente LIMIT 50`,
      [`%${q}%`, q],
    );
  }
  async enable(client: number) {
    return this.db.transaction(async (m) => {
      const [c] = await m.query(
        'SELECT * FROM cliente WHERE id_cliente=$1 AND activo FOR UPDATE',
        [client],
      );
      if (!c) throw new BadRequestException('Selecciona un cliente activo.');
      const [existing] = await m.query(
        "SELECT * FROM enlace_referido WHERE id_cliente=$1 AND codigo ~ '^[a-f0-9]{30}$' ORDER BY fecha_creacion DESC LIMIT 1 FOR UPDATE",
        [client],
      );
      if (existing) {
        await m.query(
          'UPDATE enlace_referido SET activo=true,fecha_actualizacion=now() WHERE id_referido=$1',
          [existing.id_referido],
        );
        return { idReferido: existing.id_referido, codigo: existing.codigo };
      }
      // Legacy human-selected codes remain historical; only random codes can be shared publicly.
      await m.query(
        'UPDATE enlace_referido SET activo=false,fecha_actualizacion=now() WHERE id_cliente=$1 AND activo',
        [client],
      );
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomBytes(15).toString('hex');
        const [row] = await m.query(
          `INSERT INTO enlace_referido(id_lead_referente,id_cliente,codigo) VALUES($1,$2,$3) ON CONFLICT(codigo) DO NOTHING RETURNING id_referido`,
          [c.id_lead, client, code],
        );
        if (row) return { idReferido: row.id_referido, codigo: code };
      }
      throw new ConflictException(
        'No se pudo generar el código. Inténtalo nuevamente.',
      );
    });
  }
  async status(id: number, active: boolean) {
    return this.db.transaction(async (m) => {
      const [row] = await m.query(
        'SELECT * FROM enlace_referido WHERE id_referido=$1 FOR UPDATE',
        [id],
      );
      if (!row) throw new NotFoundException('Código no encontrado.');
      if (active && !/^[a-f0-9]{30}$/.test(row.codigo))
        throw new ConflictException(
          'Habilita al cliente para generar un código seguro; este código se conserva como histórico.',
        );
      if (
        active &&
        !(
          await m.query(
            'SELECT 1 FROM cliente WHERE id_cliente=$1 AND id_lead=$2 AND activo',
            [row.id_cliente, row.id_lead_referente],
          )
        ).length
      )
        throw new ConflictException(
          'El código requiere un cliente activo asociado.',
        );
      await m.query(
        'UPDATE enlace_referido SET activo=$1,fecha_actualizacion=now() WHERE id_referido=$2',
        [active, id],
      );
      return { ok: true };
    });
  }
  async list(dto: ReferralListDto) {
    if (dto.desde && dto.hasta && dto.desde > dto.hasta)
      throw new BadRequestException('Rango de fechas inválido.');
    const values: unknown[] = [],
      clauses: string[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      clauses.push(sql.replaceAll('?', `$${values.length}`));
    };
    if (dto.q)
      add(
        `(e.codigo ILIKE ? OR concat_ws(' ',l.nombres,l.apellidos) ILIKE ?)`,
        `%${dto.q}%`,
      );
    if (dto.estado) add('e.activo=?', dto.estado === 'activo');
    if (dto.desde)
      add(
        `e.fecha_creacion >= (?::date::timestamp AT TIME ZONE 'America/Lima')`,
        dto.desde,
      );
    if (dto.hasta)
      add(
        `e.fecha_creacion < ((?::date+1)::timestamp AT TIME ZONE 'America/Lima')`,
        dto.hasta,
      );
    if (dto.comercial)
      add(
        `EXISTS(SELECT 1 FROM atribucion_referido a WHERE a.id_referido=e.id_referido AND ${commercial}=?)`,
        dto.comercial,
      );
    const from = `FROM enlace_referido e JOIN lead l ON l.id_lead=e.id_lead_referente ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}`;
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const [count] = await m.query(
        `SELECT count(*)::int AS total ${from}`,
        values,
      );
      const items = await m.query(
        `SELECT e.id_referido AS "idReferido",e.codigo,e.activo,e.id_cliente AS "idCliente",
        concat_ws(' ',l.nombres,l.apellidos) AS cliente,e.fecha_creacion AS "fechaCreacion",e.fecha_actualizacion AS "fechaActualizacion",
        (SELECT count(*)::int FROM atribucion_referido a WHERE a.id_referido=e.id_referido) AS captados,
        (SELECT count(*)::int FROM atribucion_referido a WHERE a.id_referido=e.id_referido AND a.id_lead IS NOT NULL) AS leads,
        (SELECT count(*)::int FROM atribucion_referido a JOIN cliente c ON c.id_lead=a.id_lead WHERE a.id_referido=e.id_referido) AS clientes
        ${from} ORDER BY e.fecha_creacion DESC,e.id_referido DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, dto.pageSize, (dto.page - 1) * dto.pageSize],
      );
      return {
        items,
        total: count.total,
        page: dto.page,
        pageSize: dto.pageSize,
      };
    });
  }
  async summary() {
    const [row] = await this.db.query(`SELECT
      (SELECT count(*)::int FROM enlace_referido e JOIN cliente c USING(id_cliente) WHERE e.activo AND c.activo AND e.codigo ~ '^[a-f0-9]{30}$') AS activos,
      count(*)::int AS captados,count(a.id_lead)::int AS leads,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM cliente c WHERE c.id_lead=a.id_lead))::int AS clientes FROM atribucion_referido a`);
    return row;
  }
  async history(id: number, dto: ReferralListDto) {
    const where = `WHERE e.id_referido=$1 ${dto.comercial ? `AND ${commercial}=$2` : ''}`;
    const values: unknown[] = dto.comercial ? [id, dto.comercial] : [id];
    const [count] = await this.db.query(
      `SELECT count(*)::int AS total FROM (${attribution} ${where}) x`,
      values,
    );
    const items = await this.db.query(
      `${attribution} ${where} ORDER BY a.fecha_captacion DESC,a.id_atribucion DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, dto.pageSize, (dto.page - 1) * dto.pageSize],
    );
    return {
      items,
      total: count.total,
      page: dto.page,
      pageSize: dto.pageSize,
    };
  }
  async origin(kind: 'buyer' | 'lead', id: string) {
    const [row] = await this.db.query(
      `${attribution} WHERE a.${kind === 'buyer' ? 'id_buyer' : 'id_lead'}=$1`,
      [id],
    );
    return row || null;
  }
}
