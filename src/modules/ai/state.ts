import { z } from 'zod';
import { services, proposalCondition } from './services.js';
import { whatsappUrl } from './contact.js';
import type { NegotiationService } from './packages.js';

export const workflowStages = ['START', 'IDENTIFY_NEED', 'QUALIFY', 'RECOMMEND_SERVICE', 'HANDLE_OBJECTION', 'READY_TO_CLOSE', 'HANDOFF'] as const;
export const thesisStages = ['Buscando tema', 'Proyecto de tesis', 'Desarrollo de tesis', 'Tengo observaciones', 'Preparando sustentación'] as const;
export const greeting = 'Hola, soy Tesi. Puedo ayudarte a elegir un servicio y revisar una propuesta preliminar. ¿Qué necesitas para tu tesis?';
export const storageKey = 'tesispro-negotiation';
export const initialChoices = ['Necesito resolver observaciones', 'Necesito análisis estadístico', 'Necesito acompañamiento por etapas', 'Necesito acompañamiento completo'];
const field = z.string().trim().max(160);
export const stateSchema = z.object({
  stage: z.enum(workflowStages), name: field, university: field, degree: field,
  thesisStage: field, need: z.string().trim().max(300), deadline: field,
  service: z.string().regex(/^(puntual|etapas|integral|paquete-[1-9]\d*)$/).nullable(),
  catalogMode: z.boolean().optional(), packageVersion: z.number().int().positive().nullable().optional(),
  objections: z.array(field).max(6), discount: z.union([z.literal(0), z.literal(10)]), buyIntent: z.boolean(), humanRequested: z.boolean().default(false),
}).strict();
export type NegotiationState = z.infer<typeof stateSchema>;
export const messageSchema = z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(2400) }).strict();
export const requestSchema = z.object({
  message: z.string().trim().min(1).max(800), history: z.array(messageSchema).max(12), state: stateSchema,
}).strict();
export type NegotiationRequest = z.infer<typeof requestSchema>;

export function initialState(): NegotiationState {
  return { stage: 'START', name: '', university: '', degree: '', thesisStage: '', need: '', deadline: '', service: null, objections: [], discount: 0, buyIntent: false, humanRequested: false };
}
export function serviceById(id: string | null, catalog:readonly NegotiationService[]=services) { return catalog.find(service => service.id === id); }
export function proposal(state: NegotiationState, catalog?:readonly NegotiationService[]) {
  if(state.catalogMode && !catalog) return null;
  const service = serviceById(state.service,catalog);
  if (!service) return null;
  const discount = Math.min(state.discount, service.maxDiscount);
  const min = Math.round(service.minPrice * 100 * (1 - discount / 100))/100;
  const max = Math.round(service.maxPrice * 100 * (1 - discount / 100))/100;
  const money = (value: number) => !service.currency || service.currency==='PEN' ? `S/${value.toLocaleString('en-US')}` : new Intl.NumberFormat('es-PE',{style:'currency',currency:service.currency}).format(value);
  return { service: service.id, name: service.name, min, max, discount, condition: service.condition||proposalCondition,
    benefits: service.benefits || [], deliverables: service.deliverables || [],
    text: `${min === max ? money(min) : `${money(min)}–${money(max)}`} ${service.unit}${discount ? ' · reducción provisional del 10%' : ''}` };
}
export function qualifyStage(state: NegotiationState, objection = false): NegotiationState['stage'] {
  if (state.humanRequested) return 'READY_TO_CLOSE';
  if (!state.need) return 'IDENTIFY_NEED';
  if (!state.thesisStage || !state.service) return 'QUALIFY';
  if (state.buyIntent) return 'READY_TO_CLOSE';
  return objection ? 'HANDLE_OBJECTION' : 'RECOMMEND_SERVICE';
}
export function summaryLines(state: NegotiationState,catalog?:readonly NegotiationService[]): [string, string][] {
  const quote = proposal(state,catalog);
  const fields: [string, string][] = [['Nombre', state.name], ['Universidad', state.university], ['Grado', state.degree],
    ['Etapa', state.thesisStage], ['Necesidad', state.need], ['Servicio recomendado', quote?.name || ''],
    ['Plazo solicitado', state.deadline], ['Propuesta preliminar', quote?.text || ''], ['Objeciones conversadas', state.objections.join('; ')]];
  return fields.filter(([, value]) => Boolean(value));
}
export function handoffMessage(state: NegotiationState,catalog?:readonly NegotiationService[]) {
  return ['Hola, vengo desde TesisPro.net. Conversé con Tesi sobre una solicitud preliminar.', '',
    'Resumen de mi solicitud:', ...summaryLines(state,catalog).map(([label, value]) => `- ${label}: ${value}`), '',
    proposalCondition, '', state.buyIntent ? 'Deseo continuar con un asesor humano para confirmar los detalles.' : 'Deseo conversar con un asesor humano sobre mi solicitud.'].join('\n');
}
export function handoffUrl(state: NegotiationState,catalog?:readonly NegotiationService[]) { return whatsappUrl(handoffMessage(state,catalog)); }

// El almacenamiento no incluye precios confiados al cliente: se recalculan desde la configuración.
export function restoreSession(raw: string | null) {
  if (!raw) return null;
  try {
    const saved = z.object({ version: z.literal(1), state: stateSchema, messages: z.array(messageSchema).max(60) }).strict().parse(JSON.parse(raw));
    if (saved.state.stage === 'HANDOFF') return null;
    const service = serviceById(saved.state.service);
    saved.state.discount = service?.maxDiscount ? saved.state.discount : 0;
    if (saved.state.stage !== 'START') saved.state.stage = qualifyStage(saved.state, saved.state.stage === 'HANDLE_OBJECTION');
    return saved;
  } catch { return null; }
}
