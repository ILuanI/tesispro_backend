import { services } from './services.js';
import { initialChoices, proposal, thesisStages, type NegotiationState } from './state.js';
import type { Extraction } from './commercial.js';

export const normalizeLocalMessage = (message: string) => message.toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim();

const serviceChoices = ['Busco una sesión puntual', 'Busco acompañamiento por etapas', 'Busco acompañamiento integral'];
type LocalRule = { reply: string; quickReplies?: string[] } | { extraction: Extraction };
const action = (updates: Partial<Extraction>): LocalRule => ({ extraction: {
  kind: 'business', name: null, university: null, degree: null, thesisStage: null,
  need: null, deadline: null, service: null, intent: 'unchanged', human: false, objection: 'none', ...updates,
} });

function continuation(state: NegotiationState) {
  if (state.humanRequested || state.stage === 'READY_TO_CLOSE') return { reply: 'Puedes continuar con un asesor humano desde el resumen de tu solicitud.' };
  if (!state.need) return { reply: '¿Qué necesitas para tu tesis?', quickReplies: initialChoices };
  if (!state.thesisStage) return { reply: '¿En qué etapa se encuentra tu tesis?', quickReplies: [...thesisStages] };
  if (!state.service) return { reply: '¿Buscas una sesión puntual, apoyo por etapas o acompañamiento integral?', quickReplies: serviceChoices };
  return { reply: '¿Quieres aclarar alguna duda sobre la propuesta o continuar con un asesor?', quickReplies: ['¿Qué incluye el servicio?', 'Quiero continuar con un asesor'] };
}

// Coincidencias completas: ningún saludo o palabra aislada absorbe datos nuevos.
export function matchLocalNegotiation(message: string, state: NegotiationState): LocalRule | null {
  const text = normalizeLocalMessage(message);
  if (/^(hola(?: que tal| mucho gusto)?|buenos dias|buenas tardes|buenas noches|mucho gusto)$/.test(text)) {
    const next = continuation(state);
    return { ...next, reply: `¡Hola! Soy Tesi. ${next.reply}` };
  }
  if (/^(gracias|muchas gracias|igualmente|hasta luego|hasta pronto|adios|chau|nos vemos)$/.test(text)) {
    return { reply: /^(hasta|adios|chau|nos vemos)/.test(text) ? '¡Hasta pronto! Puedes retomar tu consulta cuando quieras.' : '¡Con gusto! Estoy aquí si necesitas aclarar algo más.' };
  }
  if (/^(quien eres|como te llamas|cual es tu nombre)$/.test(text)) return { reply: 'Soy Tesi, el asistente IA de TesisPro.net. Te ayudo a elegir un servicio y revisar una propuesta preliminar.' };
  if (/^(nombre de la empresa|como se llama la empresa|cual es el nombre de la empresa)$/.test(text)) return { reply: 'La marca es TesisPro.net.' };
  if (text === 'cuando') return { reply: '¿Te refieres al inicio o a la duración del servicio?', quickReplies: ['¿Cuándo empieza el servicio?', '¿Cuánto dura el servicio?'] };
  if (/^(que horarios (tienen|manejan)|cual es (el|su) horario|horarios?|cuando (empieza|inicia|comienza)( el servicio)?|cuando (puedo|podemos) (empezar|iniciar)|cuanto dura( el servicio)?|duracion del servicio)$/.test(text)) {
    return { reply: 'El horario, el inicio y la duración del servicio deben confirmarse con un asesor humano según el alcance y la disponibilidad.' };
  }
  if (/^(que servicios (ofrecen|tienen)|cuales son (sus|los) servicios|servicios)$/.test(text)) {
    return { reply: services.map(service => `${service.name}: ${service.commercialDescription}`).join('\n\n') };
  }
  const serviceAliases = [
    /^(asesoria puntual|puntual|sesion puntual)$/,
    /^(acompanamiento por etapas|por etapas|etapas)$/,
    /^(asesoria integral(?: 360°?)?|acompanamiento integral|integral)$/,
  ];
  const namedPrice = text.match(/^(?:cuanto (?:cuesta|vale)|(?:cual es el )?precio(?: de)?|(?:cual es la )?tarifa(?: de)?)(?: la| el)? (.+)$/);
  const genericPrice = /^(cuanto cuesta|cuanto vale|cual es el precio|precio|cual es la tarifa)(?: el servicio)?$/.test(text);
  if (genericPrice || namedPrice) {
    const service = genericPrice ? services.find(service => service.id === state.service)
      : services.find((_service, index) => serviceAliases[index].test(namedPrice![1]));
    if (!genericPrice && !service) return null;
    if (!service) return { reply: '¿De cuál de nuestros tres servicios quieres conocer la tarifa?', quickReplies: serviceChoices };
    const quote = proposal({ ...state, service: service.id, discount: service.id === state.service ? state.discount : 0 })!;
    return { reply: `${quote.name}: ${quote.text}. ${quote.condition}` };
  }
  if (/^que incluye(?: el servicio)?$/.test(text)) {
    const service = services.find(service => service.id === state.service);
    return service ? { reply: `${service.name}: ${service.commercialDescription}` }
      : { reply: '¿Sobre cuál de nuestros tres servicios quieres conocer el alcance?', quickReplies: serviceChoices };
  }
  const selection = serviceChoices.findIndex(choice => normalizeLocalMessage(choice) === text);
  if (selection !== -1) return action({ service: services[selection].id });
  const stage = thesisStages.find(stage => normalizeLocalMessage(stage) === text);
  if (stage) return action({ thesisStage: stage });
  const need = initialChoices.findIndex(choice => normalizeLocalMessage(choice) === text);
  if (need !== -1) {
    const updates: Partial<Extraction>[] = [
      { need: initialChoices[0], thesisStage: 'Tengo observaciones', service: 'puntual' },
      { need: initialChoices[1], service: 'puntual' },
      { need: initialChoices[2], service: 'etapas' },
      { need: initialChoices[3], service: 'integral' },
    ];
    return action(updates[need]);
  }
  if (/^(esta (muy )?caro|quiero un descuento|dame otro descuento)$/.test(text)) return action({ objection: 'price' });
  if (/^(lo voy a pensar|lo pensare)$/.test(text)) return action({ objection: 'think' });
  if (text === 'tengo poco tiempo') return action({ objection: 'time' });
  if (text === 'no se si me sirve') return action({ objection: 'uncertain' });
  if (text === 'quiero revisar otra opcion') return { reply: '¿Qué alternativa quieres revisar?', quickReplies: serviceChoices };
  return null;
}
