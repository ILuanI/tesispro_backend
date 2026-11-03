import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { cents, decimal } from './money.js';
import { PackagesService } from './packages.service.js';
import { CommercialServiceDto, ProposalActionDto, ProposalDraftDto } from './commercial-proposal.dto.js';

@Injectable()
export class CommercialProposalService {
  constructor(private readonly db: DataSource, private readonly packages: PackagesService) {}
  async catalog() {
    const legacy = await this.packages.isExistingCatalog();
    const servicios = await this.db.query(`SELECT s.id_servicio AS "idServicio",s.codigo,s.nombre,s.descripcion,s.activo AS "servicioActivo",c.precio,c.moneda,c.activo,c.plazo_dias AS "plazoDias",c.entregables,c.condiciones,c.descuento_max AS "descuentoMax",c.revision FROM servicio s LEFT JOIN r8_servicio_comercial c USING(id_servicio) WHERE NOT coalesce((to_jsonb(s)->>'es_paquete')::boolean,false) ${legacy ? 'AND NOT EXISTS(SELECT 1 FROM paquete p WHERE p.id_servicio=s.id_servicio)' : ''} ORDER BY s.nombre`);
    return { servicios, paquetes: await this.packages.authorized(), opcionales: await this.db.query('SELECT id_paquete AS "idPaquete",id_servicio AS "idServicio" FROM r8_paquete_opcional'), incompatibilidades: await this.db.query('SELECT id_servicio_a AS "idServicioA",id_servicio_b AS "idServicioB" FROM r8_incompatibilidad') };
  }
  async recommend(lead:string) {
    const [profile]=await this.db.query('SELECT id_lead,nombres,apellidos FROM lead WHERE id_lead=$1',[lead]);
    if(!profile) throw new NotFoundException('Lead no encontrado.');
    const [academic]=await this.db.query('SELECT * FROM perfil_academico WHERE id_lead=$1',[lead]);
    const [work]=await this.db.query('SELECT * FROM perfil_laboral WHERE id_lead=$1',[lead]);
    const projects=await this.db.query('SELECT * FROM proyecto_tesis WHERE id_lead=$1 ORDER BY id_proyecto',[lead]);
    const [qualification]=await this.db.query('SELECT id_calificacion,resultado FROM calificacion_tesi WHERE id_lead=$1 ORDER BY id_calificacion DESC LIMIT 1',[lead]);
    if(!qualification?.resultado?.campos?.necesidad?.valor) throw new BadRequestException('El lead necesita una necesidad identificada en R7.');
    const [review]=await this.db.query("SELECT despues->>'accion' AS accion FROM evento_perfil WHERE id_lead=$1 AND tipo='revision_calificacion' AND despues->>'grupo'='campos' AND despues->>'campo'='necesidad' AND despues->>'idCalificacion'=$2 ORDER BY id_evento DESC LIMIT 1",[lead,String(qualification.id_calificacion)]);
    if(review?.accion==='rechazar') throw new BadRequestException('La necesidad fue rechazada; actualiza su evaluación antes de continuar.');
    const catalog=await this.catalog();
    const components=[...catalog.servicios.filter((s:any)=>s.activo && s.servicioActivo).map((s:any)=>({idServicio:s.idServicio,nombre:s.nombre,descripcion:String(s.descripcion || '').slice(0,2000)})), ...catalog.paquetes.map(p=>({idServicio:p.idServicio,nombre:`Paquete ${p.nombre}`,descripcion:(p.descripcion || '').slice(0,2000),componentes:p.componentes.map(c=>c.nombre)}))].slice(0,50);
    if(!components.length) throw new BadRequestException('Configura primero servicios comerciales activos.');
    const secret=process.env.CRM_BRIDGE_SECRET || '';
    if(secret.length<32) throw new ServiceUnavailableException('Integración de IA no configurada.');
    try {
      const response=await fetch(process.env.R8_AI_URL || 'http://localhost:4321/api/internal/proposal',{method:'POST',headers:{'Content-Type':'application/json','X-CRM-Secret':secret},body:JSON.stringify({perfil:{...profile,perfilAcademico:academic || null,perfilLaboral:work || null,proyectos:projects},calificacion:qualification.resultado,componentes:components}),signal:AbortSignal.timeout(30000)});
      if(!response.ok) throw new Error('AI unavailable');
      const result=await response.json();
      if(!Array.isArray(result.ids) || result.ids.some((id:any)=>!components.some((s:any)=>s.idServicio===id))) throw new Error('Invalid IDs');
      const ids = [...new Set<number>(result.ids)];
      const selectedPackages = catalog.paquetes.filter(p=>ids.includes(p.idServicio));
      if(selectedPackages.length>1) throw new Error('Una recomendación admite un paquete.');
      const selectedPackage = selectedPackages[0];
      const selectedLines = selectedPackage ? selectedPackage.componentes.map(c=>({idServicio:c.idServicio,cantidad:c.cantidad})) : [];
      for(const id of ids) if(!selectedPackage || id!==selectedPackage.idServicio) {
        if(!selectedLines.some(line=>line.idServicio===id)) selectedLines.push({idServicio:id,cantidad:1});
      }
      if(!selectedLines.length) throw new Error('No hay componentes recomendados.');
      await this.db.transaction(m=>this.calculate(m,{componentes:selectedLines,...(selectedPackage ? {idPaquete:selectedPackage.idServicio,versionPaquete:selectedPackage.version} : {})}));
      return {ids:selectedLines.map(line=>line.idServicio),idPaquete:selectedPackage?.idServicio || null,texto:result.texto};
    } catch {throw new ServiceUnavailableException('No se pudo obtener una recomendación con IA.');}
  }
  async configure(id: number, dto: CommercialServiceDto, user: number) {
    if (dto.activo && (!dto.entregables.length || dto.entregables.some(item=>!item.trim()) || !dto.condiciones.trim())) throw new BadRequestException('Completa entregables y condiciones antes de habilitar el servicio.');
    return this.db.transaction(async m => {
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended('r8_catalogo',0))");
      const [service] = await m.query('SELECT * FROM servicio WHERE id_servicio=$1 FOR SHARE', [id]);
      if (!service || service.es_paquete || ((await this.packages.isExistingCatalog()) && (await m.query('SELECT 1 FROM paquete WHERE id_servicio=$1',[id])).length)) throw new BadRequestException('Selecciona un servicio individual existente.');
      const [old] = await m.query('SELECT revision FROM r8_servicio_comercial WHERE id_servicio=$1 FOR UPDATE', [id]);
      if (old && old.revision !== dto.revision) throw new ConflictException('La configuración cambió. Recarga.');
      const [row] = await m.query(`INSERT INTO r8_servicio_comercial(id_servicio,precio,moneda,activo,plazo_dias,entregables,condiciones,descuento_max,id_usuario) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) ON CONFLICT(id_servicio) DO UPDATE SET precio=excluded.precio,moneda=excluded.moneda,activo=excluded.activo,plazo_dias=excluded.plazo_dias,entregables=excluded.entregables,condiciones=excluded.condiciones,descuento_max=excluded.descuento_max,id_usuario=excluded.id_usuario,revision=r8_servicio_comercial.revision+1,actualizado_en=now() RETURNING *`, [id,decimal(cents(dto.precio)),dto.moneda,dto.activo,dto.plazoDias ?? null,JSON.stringify(dto.entregables),dto.condiciones,dto.descuentoMax,user]);
      return row;
    });
  }
  async optional(id:number, ids:number[]) {
    if(new Set(ids).size!==ids.length || ids.includes(id)) throw new BadRequestException('Componentes inválidos.');
    return this.db.transaction(async m=>{
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended('r8_catalogo',0))");
      await m.query('SELECT id_servicio FROM servicio WHERE id_servicio=$1 FOR UPDATE',[id]);
      const pkg = await this.packages.detail(id,m);
      if(ids.some(x=>pkg.componentes.some(s=>s.idServicio===x))) throw new BadRequestException('Un componente incluido no puede ser opcional.');
      const included = pkg.componentes.map(s=>s.idServicio);
      if ((await m.query('SELECT 1 FROM r8_incompatibilidad WHERE (id_servicio_a=ANY($1::int[]) AND id_servicio_b=ANY($2::int[])) OR (id_servicio_b=ANY($1::int[]) AND id_servicio_a=ANY($2::int[])) LIMIT 1',[included,ids])).length) throw new BadRequestException('Un componente opcional es incompatible con los servicios incluidos.');
      const legacy = await this.packages.isExistingCatalog();
      const services=await m.query(`SELECT id_servicio FROM servicio s WHERE id_servicio=ANY($1::int[]) AND activo AND NOT coalesce((to_jsonb(s)->>'es_paquete')::boolean,false) ${legacy ? 'AND NOT EXISTS(SELECT 1 FROM paquete p WHERE p.id_servicio=s.id_servicio)' : ''}`,[ids]);
      if(services.length!==ids.length) throw new BadRequestException('Selecciona servicios activos.');
      await m.query('DELETE FROM r8_paquete_opcional WHERE id_paquete=$1',[id]);
      for(const service of ids) await m.query('INSERT INTO r8_paquete_opcional(id_paquete,id_servicio) VALUES($1,$2)',[id,service]);
      return {ok:true};
    });
  }
  async incompatibility(first:number,second:number,value:boolean) {
    if(first===second) throw new BadRequestException('Selecciona servicios diferentes.');
    const [a,b]=[first,second].sort((x,y)=>x-y);
    await this.db.transaction(async m=>{
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended('r8_catalogo',0))");
      if(value) await m.query('INSERT INTO r8_incompatibilidad(id_servicio_a,id_servicio_b) VALUES($1,$2) ON CONFLICT DO NOTHING',[a,b]);
      else await m.query('DELETE FROM r8_incompatibilidad WHERE id_servicio_a=$1 AND id_servicio_b=$2',[a,b]);
    });
    return {ok:true};
  }
  private async calculate(m: EntityManager, dto: ProposalDraftDto) {
    await m.query("SELECT pg_advisory_xact_lock(hashtextextended('r8_catalogo',0))");
    const ids = dto.componentes.map(x => x.idServicio);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('No repitas componentes.');
    const rows = await m.query('SELECT s.id_servicio,s.codigo,s.nombre,s.activo AS servicio_activo,c.* FROM servicio s JOIN r8_servicio_comercial c USING(id_servicio) WHERE s.id_servicio=ANY($1::int[]) ORDER BY s.id_servicio FOR SHARE OF s,c', [ids]);
    if (rows.length !== ids.length || rows.some((r: any) => !r.activo || !r.servicio_activo)) throw new BadRequestException('Cada componente requiere un precio autorizado y estar activo.');
    if (new Set(rows.map((r: any) => r.moneda)).size !== 1) throw new BadRequestException('Todos los componentes deben usar la misma moneda.');
    if ((await m.query('SELECT 1 FROM r8_incompatibilidad WHERE id_servicio_a=ANY($1::int[]) AND id_servicio_b=ANY($1::int[]) LIMIT 1', [ids])).length) throw new BadRequestException('Los componentes seleccionados son incompatibles.');
    let paquete: any = null;
    if (dto.idPaquete) {
      if (!dto.versionPaquete) throw new BadRequestException('Indica la versión del paquete.');
      paquete = (await this.packages.forProposal(m,dto.idPaquete,dto.versionPaquete)).paquete;
      const included = paquete.componentes as {idServicio:number;cantidad:number}[];
      const optional = await m.query('SELECT id_servicio FROM r8_paquete_opcional WHERE id_paquete=$1',[dto.idPaquete]);
      for (const line of included) if (!dto.componentes.some(x => x.idServicio===line.idServicio && x.cantidad===line.cantidad)) throw new BadRequestException('Conserva los componentes y cantidades incluidos en el paquete.');
      if (ids.some(id => !included.some(x=>x.idServicio===id) && !optional.some((x:any)=>x.id_servicio===id))) throw new BadRequestException('El componente no está permitido como opcional.');
    } else if (dto.versionPaquete) throw new BadRequestException('Selecciona un paquete.');
    const discount = dto.descuentoPorcentaje || 0;
    const requiresApproval = rows.some((r:any)=>discount>Number(r.descuento_max)) || !!dto.condicionesEspeciales?.trim();
    if (requiresApproval && !dto.motivoExcepcion?.trim()) throw new BadRequestException('Indica el motivo de la excepción.');
    let total = 0n;
    const componentes = dto.componentes.map(line=>{
      const s=rows.find((r:any)=>r.id_servicio===line.idServicio);
      const bruto=cents(String(s.precio))*BigInt(line.cantidad);
      const descuento=(bruto*BigInt(discount)+50n)/100n;
      total+=bruto-descuento;
      return {idServicio:s.id_servicio,codigo:s.codigo,nombre:s.nombre,descripcion:s.descripcion,cantidad:line.cantidad,precioUnitario:decimal(cents(String(s.precio))),descuento:decimal(descuento),subtotal:decimal(bruto-descuento),moneda:s.moneda,plazoDias:s.plazo_dias,entregables:s.entregables,condiciones:s.condiciones,revision:s.revision};
    });
    if (total<=0n || total>9999999999n) throw new BadRequestException('El total debe ser positivo y estar dentro del límite permitido.');
    return {paquete,componentes,moneda:rows[0].moneda,total:decimal(total),descuentoPorcentaje:discount,condicionesEspeciales:dto.condicionesEspeciales?.trim() || null,excepcion:requiresApproval,motivoExcepcion:dto.motivoExcepcion?.trim() || null};
  }
  async generate(lead: string, dto: ProposalDraftDto, user: number, proposal?: string) {
    // Prepare data first; the AI endpoint receives no prices or conditions.
    const [profile] = await this.db.query('SELECT id_lead,nombres,apellidos,revision FROM lead WHERE id_lead=$1',[lead]);
    if (!profile) throw new NotFoundException('Lead no encontrado.');
    const [academic] = await this.db.query('SELECT * FROM perfil_academico WHERE id_lead=$1',[lead]);
    const [work] = await this.db.query('SELECT * FROM perfil_laboral WHERE id_lead=$1',[lead]);
    const projects = await this.db.query('SELECT * FROM proyecto_tesis WHERE id_lead=$1 ORDER BY id_proyecto',[lead]);
    const profileSnapshot = {...profile,perfilAcademico:academic || null,perfilLaboral:work || null,proyectos:projects};
    const [qualification] = dto.idConversacion ? await this.db.query('SELECT q.id_calificacion,q.resultado FROM calificacion_tesi q JOIN conversacion c USING(id_conversacion) WHERE c.id_lead=$1 AND c.id_conversacion=$2 ORDER BY q.id_calificacion DESC LIMIT 1',[lead,dto.idConversacion]) : await this.db.query('SELECT id_calificacion,resultado FROM calificacion_tesi WHERE id_lead=$1 ORDER BY id_calificacion DESC LIMIT 1',[lead]);
    if (!qualification?.resultado?.campos?.necesidad?.valor) throw new BadRequestException('El lead necesita una necesidad identificada en R7.');
    const [review] = await this.db.query("SELECT despues->>'accion' AS accion FROM evento_perfil WHERE id_lead=$1 AND tipo='revision_calificacion' AND despues->>'grupo'='campos' AND despues->>'campo'='necesidad' AND despues->>'idCalificacion'=$2 ORDER BY id_evento DESC LIMIT 1",[lead,String(qualification.id_calificacion)]);
    if (review?.accion==='rechazar') throw new BadRequestException('La necesidad fue rechazada; actualiza su evaluación antes de continuar.');
    const preliminary = await this.db.transaction(m=>this.calculate(m,dto));
    const secret=process.env.CRM_BRIDGE_SECRET || '';
    const endpoint=process.env.R8_AI_URL || 'http://localhost:4321/api/internal/proposal';
    let ai: any;
    if(dto.textoManual?.trim()) {
      if(!proposal) throw new BadRequestException('El texto manual requiere una propuesta existente.');
      if(/\d|[%$€]|\b(precio|descuento|garant[ií]a|garantiza|plazo|fecha|condiciones|entregable|costo|tarifa)\b/i.test(dto.textoManual)) throw new BadRequestException('Registra importes, entregables y condiciones en los campos comerciales, no en la descripción.');
      ai={texto:dto.textoManual.trim(),ids:preliminary.componentes.map(x=>x.idServicio)};
    } else try {
      if (secret.length<32) throw new Error('Integración no configurada');
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-CRM-Secret':secret},body:JSON.stringify({perfil:profileSnapshot,calificacion:qualification.resultado,componentes:preliminary.componentes.map(x=>({idServicio:x.idServicio,nombre:x.nombre,descripcion:String(x.descripcion || '').slice(0,2000)}))}),signal:AbortSignal.timeout(30000)});
      if(!response.ok) throw new Error('AI unavailable');
      ai=await response.json();
      if(typeof ai?.texto!=='string' || !ai.texto.trim() || ai.texto.length>5000 || !Array.isArray(ai.ids) || ai.ids.some((id:any)=>!preliminary.componentes.some(x=>x.idServicio===id))) throw new Error('Invalid AI result');
    } catch { throw new ServiceUnavailableException('No se pudo generar la propuesta con IA.'); }
    return this.db.transaction(async m=>{
      const [lockedProfile] = await m.query('SELECT revision FROM lead WHERE id_lead=$1 FOR SHARE',[lead]);
      const [latestQualification] = dto.idConversacion ? await m.query('SELECT q.id_calificacion FROM calificacion_tesi q JOIN conversacion c USING(id_conversacion) WHERE c.id_lead=$1 AND c.id_conversacion=$2 ORDER BY q.id_calificacion DESC LIMIT 1',[lead,dto.idConversacion]) : await m.query('SELECT id_calificacion FROM calificacion_tesi WHERE id_lead=$1 ORDER BY id_calificacion DESC LIMIT 1',[lead]);
      if (!lockedProfile || lockedProfile.revision!==profile.revision || latestQualification?.id_calificacion!==qualification.id_calificacion) throw new ConflictException('El perfil o la evaluación cambiaron. Vuelve a generar.');
      const current = await this.calculate(m,dto);
      if(JSON.stringify(current)!==JSON.stringify(preliminary)) throw new ConflictException('El catálogo cambió; vuelve a generar la propuesta.');
      let proposalId=proposal, version=1;
      if(proposalId) {
        const [head]=await m.query('SELECT r.*,p.id_lead FROM r8_propuesta r JOIN propuesta p USING(id_propuesta) WHERE r.id_propuesta=$1 FOR UPDATE OF r',[proposalId]);
        if(!head || head.id_lead!==lead) throw new NotFoundException('Propuesta no encontrada.');
        if(head.version_actual!==dto.revision) throw new ConflictException('La propuesta cambió. Recarga.');
        if(!['borrador','revisada','cambios_solicitados'].includes(head.estado)) throw new ConflictException('Esta propuesta no se puede editar.');
        version=head.version_actual+1;
        await m.query("UPDATE r8_propuesta SET version_actual=$2,estado='borrador',actualizado_en=now() WHERE id_propuesta=$1",[proposalId,version]);
        await m.query("UPDATE propuesta SET estado='borrador',monto_total=$2,moneda=$3 WHERE id_propuesta=$1",[proposalId,current.total,current.moneda]);
      } else {
        const [p]=await m.query("INSERT INTO propuesta(id_lead,id_usuario,id_conversacion,estado,monto_total,moneda) VALUES($1,$2,$3,'borrador',$4,$5) RETURNING id_propuesta",[lead,user,dto.idConversacion||null,current.total,current.moneda]);
        proposalId=p.id_propuesta;
        await m.query('INSERT INTO r8_propuesta(id_propuesta,version_actual) VALUES($1,1)',[proposalId]);
      }
      const content={...current,perfil:profileSnapshot,calificacion:{idCalificacion:qualification.id_calificacion,resultado:qualification.resultado},texto:ai.texto,idsRecomendados:ai.ids};
      await m.query('INSERT INTO r8_propuesta_version(id_propuesta,version,contenido,excepcion,motivo_excepcion,id_autor) VALUES($1,$2,$3::jsonb,$4,$5,$6)',[proposalId,version,JSON.stringify(content),current.excepcion,current.motivoExcepcion,user]);
      await m.query('DELETE FROM propuesta_detalle WHERE id_propuesta=$1',[proposalId]);
      for (const line of current.componentes) await m.query('INSERT INTO propuesta_detalle(id_propuesta,id_servicio,descripcion,cantidad,precio_unitario,descuento) VALUES($1,$2,$3,$4,$5,$6)',[proposalId,line.idServicio,line.nombre,line.cantidad,line.precioUnitario,line.descuento]);
      await m.query('UPDATE propuesta SET condiciones=$2,tiempo_entrega_dias=$3 WHERE id_propuesta=$1',[proposalId,current.componentes.map(x=>x.condiciones).filter(Boolean).join('\n') || null,current.componentes.every(x=>x.plazoDias) ? Math.max(...current.componentes.map(x=>x.plazoDias)) : null]);
      await m.query('INSERT INTO r8_propuesta_evento(id_propuesta,version,tipo,id_usuario) VALUES($1,$2,$3,$4)',[proposalId,version,dto.textoManual?.trim() ? 'editada' : 'generada',user]);
      return {idPropuesta:proposalId,version,estado:'borrador',contenido:content};
    });
  }
  async detail(id: string) {
    const [head]=await this.db.query('SELECT r.*,p.id_lead FROM r8_propuesta r JOIN propuesta p USING(id_propuesta) WHERE r.id_propuesta=$1',[id]);
    if(!head) throw new NotFoundException('Propuesta no encontrada.');
    return { ...head, versiones:await this.db.query('SELECT * FROM r8_propuesta_version WHERE id_propuesta=$1 ORDER BY version DESC',[id]), eventos:await this.db.query('SELECT * FROM r8_propuesta_evento WHERE id_propuesta=$1 ORDER BY id_evento DESC',[id]) };
  }
  async action(id: string, dto: ProposalActionDto, user: number) {
    await this.db.transaction(async m=>{
      const [p]=await m.query('SELECT r.*,v.excepcion FROM r8_propuesta r JOIN r8_propuesta_version v ON v.id_propuesta=r.id_propuesta AND v.version=r.version_actual WHERE r.id_propuesta=$1 FOR UPDATE OF r',[id]);
      if(!p) throw new NotFoundException('Propuesta no encontrada.');
      if(p.version_actual!==dto.version) throw new ConflictException('La versión cambió. Recarga.');
      const [approval]=await m.query("SELECT 1 FROM r8_propuesta_evento WHERE id_propuesta=$1 AND version=$2 AND tipo='aprobada_excepcion'",[id,dto.version]);
      let state=p.estado;
      if(dto.accion==='aprobar_excepcion') { if(!p.excepcion || p.estado!=='borrador') throw new ConflictException('No hay excepción pendiente.'); }
      else if(dto.accion==='revisar') { if(p.estado!=='borrador' || (p.excepcion && !approval)) throw new ConflictException('Aprueba primero las excepciones.'); state='revisada'; }
      else if(dto.accion==='presentar') { if(p.estado!=='revisada' || (p.excepcion && !approval)) throw new ConflictException('Revisa primero la propuesta.'); state='enviada'; }
      else { if(p.estado!=='enviada') throw new ConflictException('Registra primero la presentación.'); state=({aceptar:'aceptada',rechazar:'rechazada',solicitar_cambios:'cambios_solicitados'} as Record<string,string>)[dto.accion]; }
      if(['rechazar','solicitar_cambios'].includes(dto.accion) && !dto.motivo?.trim()) throw new BadRequestException('Indica el motivo.');
      const type=dto.accion==='aprobar_excepcion'?'aprobada_excepcion':dto.accion;
      await m.query('INSERT INTO r8_propuesta_evento(id_propuesta,version,tipo,detalle,id_usuario) VALUES($1,$2,$3,$4::jsonb,$5)',[id,dto.version,type,JSON.stringify({motivo:dto.motivo || null}),user]);
      await m.query('UPDATE r8_propuesta SET estado=$2,actualizado_en=now() WHERE id_propuesta=$1',[id,state]);
      if(state==='enviada') await m.query("UPDATE propuesta SET estado='enviada',fecha_envio=now() WHERE id_propuesta=$1",[id]);
      else if(state==='aceptada' || state==='rechazada') await m.query('UPDATE propuesta SET estado=$2::estado_propuesta,fecha_respuesta=now(),motivo_rechazo=$3 WHERE id_propuesta=$1',[id,state,state==='rechazada'?dto.motivo:null]);
      else if(state==='cambios_solicitados') await m.query('UPDATE propuesta SET fecha_respuesta=now() WHERE id_propuesta=$1',[id]);
    });
    return this.detail(id);
  }
}
