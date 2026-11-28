import type { NegotiationService } from '../ai/packages.js';
import { localRoute, normalize } from './registry.js';

export type WhatsAppAiPolicy = {
  /** off: solo respuestas por reglas. live: orquestador y agentes con IA. */
  aiMode: 'off' | 'live';
  /** Turnos con IA por día (UTC). 0 desactiva la IA. */
  aiDailyLimit: number;
  /** Minutos sin mensajes tras los que Tesi deja de usar el historial reciente. */
  contextMinutes: number;
};

export const whatsappAiOff: WhatsAppAiPolicy = { aiMode: 'off', aiDailyLimit: 0, contextMinutes: 5 };

export const publicScopeReply = 'Puedo responder preguntas generales sobre TesisPro y sus servicios. ¿Qué servicio te interesa?';

export function localWhatsAppAnswer(message: string, catalog: NegotiationService[]) {
  const text = normalize(message);
  const agents = localRoute(message);
  if (agents?.some(id => id !== 'marketing' && id !== 'negociador')) return 'scope';
  if (/\b(recursos|guias|materiales)\b/.test(text)) return 'resources';
  const named = catalog.find(service => normalize(service.name).length >= 4 && text.includes(normalize(service.name)));
  if (named) return named;
  if (agents || /\b(servicios|catalogo|asesorias|planes|paquetes|que ofrecen|que hacen)\b/.test(text)) return 'catalog';
  if (/\b(tesispro|asesoria|acompanamiento|orientacion|diagnostico|cotizar|apoyo)\b/.test(text)) return 'classify';
  return 'scope';
}

export function publicCatalogReply(catalog: NegotiationService[]) {
  return 'Soy Tesi. Puedo orientarte sobre los servicios de TesisPro.' +
    (catalog.length ? '\nServicios disponibles: ' + catalog.slice(0, 6).map(item => item.name).join(', ') + '.' : '') +
    ' ¿Sobre cuál te gustaría consultar?';
}
