import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

// Only outstanding installments in the current, approved schedule are eligible.
export const outstandingSql = `SELECT q.id_cuota,cp.id_contrato,q.fecha_vencimiento,
  q.monto-coalesce((SELECT sum(n.monto) FROM pago_neto n WHERE n.id_cuota=q.id_cuota AND n.estado='confirmado'),0) AS saldo
  FROM cuota_pago q JOIN cronograma_pago cp ON cp.id_version_actual=q.id_version
  JOIN cronograma_version v ON v.id_version=q.id_version
  WHERE v.estado IN ('negociado','en_ejecucion') AND q.fecha_vencimiento<(now() AT TIME ZONE 'America/Lima')::date
  AND q.monto>coalesce((SELECT sum(n.monto) FROM pago_neto n WHERE n.id_cuota=q.id_cuota AND n.estado='confirmado'),0)`;

@Injectable()
export class AttentionService {
  constructor(private readonly db:DataSource) {}
  async list() {
    await this.db.query(`UPDATE agente_recordatorio SET estado='obsoleto' WHERE estado='pendiente' AND id_cuota NOT IN (SELECT id_cuota FROM (${outstandingSql}) due)`);
    return {requests:await this.db.query(`SELECT s.*,c.estado AS atencion,c.id_lead FROM agente_solicitud s JOIN conversacion c USING(id_conversacion) ORDER BY s.creada_en DESC LIMIT 100`), reminders:await this.db.query('SELECT * FROM agente_recordatorio ORDER BY creado_en DESC LIMIT 100')};
  }
  async action(id:string, action:'tomar'|'resolver'|'reanudar', revision:number, user:number) {
    return this.db.transaction(async m=>{
      const [request]=await m.query('SELECT * FROM agente_solicitud WHERE id_solicitud=$1 FOR UPDATE',[id]);
      if (!request) throw new NotFoundException('Solicitud no encontrada.');
      if (request.revision!==revision) throw new ConflictException('La solicitud cambió. Recarga.');
      await m.query('SELECT id_conversacion FROM conversacion WHERE id_conversacion=$1 FOR UPDATE',[request.id_conversacion]);
      if (action==='reanudar') {
        const [pending]=await m.query("SELECT 1 FROM agente_solicitud WHERE id_conversacion=$1 AND estado<>'resuelta' LIMIT 1",[request.id_conversacion]);
        if (pending) throw new ConflictException('Resuelve las solicitudes pendientes antes de reanudar.');
        await m.query("UPDATE conversacion SET estado='abierta' WHERE id_conversacion=$1 AND cerrada_en IS NULL",[request.id_conversacion]);
        await m.query("UPDATE derivacion_humana SET estado='resuelta' WHERE id_conversacion=$1 AND estado IN ('pendiente','en_atencion')",[request.id_conversacion]);
      } else {
        await m.query('UPDATE agente_solicitud SET estado=$2,id_responsable=$3,revision=revision+1 WHERE id_solicitud=$1',[id,action==='tomar'?'en_atencion':'resuelta',user]);
        if(action==='tomar') await m.query("UPDATE conversacion SET estado='derivada',agente_reserva=NULL,agente_expira=NULL WHERE id_conversacion=$1",[request.id_conversacion]);
      }
      await m.query('INSERT INTO agente_evento(id_conversacion,id_usuario,accion) VALUES($1,$2,$3)',[request.id_conversacion,user,action]);
      return {ok:true};
    });
  }
  async generate() {
    const rows=await this.db.query(`INSERT INTO agente_recordatorio(id_cuota,texto)
      SELECT id_cuota,'Revisar cuota vencida y verificar saldo e identidad antes de contactar al cliente.'
      FROM (${outstandingSql}) due WHERE NOT EXISTS(SELECT 1 FROM agente_recordatorio r WHERE r.id_cuota=due.id_cuota AND regla='vencida-v1')
      ORDER BY id_cuota LIMIT 100 ON CONFLICT(id_cuota,regla) DO NOTHING RETURNING id_recordatorio`);
    return {created:rows.length,batchSize:100};
  }
  async review(id:string,user:number) {
    return this.db.transaction(async m=>{
      const [r]=await m.query('SELECT * FROM agente_recordatorio WHERE id_recordatorio=$1 FOR UPDATE',[id]);
      if(!r) throw new NotFoundException('Recordatorio no encontrado.');
      const [due]=await m.query(`SELECT 1 FROM (${outstandingSql}) due WHERE id_cuota=$1`,[r.id_cuota]);
      const state=due?'revisado':'obsoleto';
      await m.query('UPDATE agente_recordatorio SET estado=$2,id_revisor=$3 WHERE id_recordatorio=$1',[id,state,user]);
      return {estado:state};
    });
  }
}
