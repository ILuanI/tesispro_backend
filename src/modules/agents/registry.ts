export const agentIds = ['marketing','negociador','cobranza','academico','postventa'] as const;
export type AgentId = typeof agentIds[number];
export const registry: Record<AgentId, {version:string; instructions:string; tools:readonly string[]}> = {
  marketing: {version:'1', instructions:'Orienta sobre servicios públicos y recursos aprobados. No inventes condiciones ni prometas resultados.', tools:['catalogo_publico','recursos_publicos','registrar_solicitud','faq']},
  negociador: {version:'1', instructions:'Interpreta necesidad e intención con evidencia. Solo recomienda paquetes vigentes; descuentos y formalización requieren autorización.', tools:['catalogo_publico','calificar']},
  cobranza: {version:'1', instructions:'Explica modalidades públicas. Las afirmaciones de pago son solicitudes para revisión, nunca pagos confirmados.', tools:['modalidades_publicas','registrar_solicitud']},
  academico: {version:'1', instructions:'Responde con conocimiento académico aprobado y fuentes. No reveles proyectos privados ni inventes avances.', tools:['faq']},
  postventa: {version:'1', instructions:'Recoge incidencias y solicitudes de continuidad para atención humana. No cambies compromisos contractuales.', tools:['registrar_solicitud']},
};
export function authorizeTool(agent: AgentId, tool: string) {
  if (!registry[agent].tools.includes(tool)) throw new Error('Herramienta no autorizada');
}
export const normalize = (s:string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
export function localRoute(message:string): AgentId[] | null {
  const t=normalize(message), found:AgentId[]=[];
  if (/\b(pague|pagado|comprobante|saldo|deuda|cuota|cuotas|financiamiento|formas de pago|modalidades de pago)\b/.test(t)) found.push('cobranza');
  if (/\b(contratar|precio|descuento|cotizacion|ampliar|paquete)\b/.test(t)) found.push('negociador');
  if (/\b(reclamo|queja|incidencia|insatisfecho|seguimiento|mi contrato|mi proyecto)\b/.test(t)) found.push('postventa');
  if (/\b(hipotesis|muestra|metodologia|normas apa|marco teorico)\b/.test(t)) found.push('academico');
  if (found.length) return found;
  if (/^(hola|buenos dias|buenas tardes|buenas noches|gracias)[.! ]*$/.test(t) || /que servicios|informacion general|recursos gratuitos/.test(t)) return ['marketing'];
  return null;
}
