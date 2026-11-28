import { initialState, stateSchema, messageSchema, qualifyStage } from './state.js';
import { negotiate, localNegotiation, interpretCommercial, humanResult } from './commercial.js';
import type { AIOptions } from './ai-provider.js';
import type { NegotiationService } from './packages.js';
const paymentQuestion=(s:string)=>/cuotas?|financiamiento|modalidades? de pago|formas? de pago/i.test(s);
export async function commercialTurn(input: {message:string}, begin:any, catalog:NegotiationService[], options:AIOptions, paymentModes:string) {
    const trusted = {
      message: input.message,
      state: begin.estado ? stateSchema.parse(begin.estado) : initialState(),
      history: messageSchema
        .array()
        .max(12)
        .parse(begin.history || []),
    };
    const selected = catalog.find(item => item.id === trusted.state.service);
    const changed = !!trusted.state.service && (!selected || trusted.state.packageVersion !== selected.version);
    trusted.state = { ...trusted.state, catalogMode: true, discount: 0, service: selected?.id || null, packageVersion: selected?.version || null, buyIntent: changed ? false : trusted.state.buyIntent };
    if (trusted.state.stage !== 'HANDOFF') trusted.state.stage = qualifyStage(trusted.state);
    const text = input.message.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const explicitHuman = /^(?:(quiero|deseo|necesito|prefiero) (hablar|conversar) con (un |una )?(asesor|persona|humano|humana|alguien)|[¿?]*(como|donde) (pago|pagar))[.?!¿ ]*$/.test(text);
    const mixedHuman = !/\bno (quiero|deseo|necesito|prefiero)\b/.test(text) && /\b(quiero|deseo|necesito|prefiero)\b.{0,20}\b(hablar|conversar)\b.{0,20}\b(asesor|persona|humano|humana|alguien)\b/.test(text);
    const greeting = /^(hola|buenos dias|buenas tardes|buenas noches|gracias)[.! ]*$/.test(text);
    const previousFields = begin.calificacionAnterior?.campos || {};
    const confirmationField = ['necesidad', 'etapa', 'urgencia', 'servicio', 'nombre', 'universidad', 'grado'].find(key => {
      const item = previousFields[key];
      return item && item.tipo !== 'confirmado' && typeof item.valor === 'string' && (input.message === `Confirmo ${key}: ${item.valor}` || (key === 'necesidad' && input.message === `Confirmo: ${item.valor}`));
    });
    const explicitConfirmation = !!confirmationField;
    const paymentOnly = /^(?:[??]*(?:cuales son las |que |puedo pagar en |tienen |ofrecen )?(?:cuotas|financiamiento|modalidades de pago|formas de pago|pago unico)[??. ]*)$/i.test(text);
    let result = paymentOnly ? {state:trusted.state,reply:paymentModes,quickReplies:[],proposal:null,readyForHandoff:false,faq:false} : explicitConfirmation ? { state: trusted.state, reply: 'Gracias por confirmar la información. ¿Hay algún detalle más que quieras añadir?', quickReplies: [], proposal: null, readyForHandoff: false, faq: false } : explicitHuman ? humanResult(trusted.state) : greeting ? localNegotiation(trusted, catalog) : null;

    const evidencias = (begin.evidencias || []).map((item: { idMensaje: string; text: string }) => ({ idMensaje: String(item.idMensaje), text: item.text }));
    let interpretacionR7: {
      campos: Record<string, { valor: string; evidencias: { idMensaje: string; fragmento: string }[]; tipo?: string }>;
      senales: Record<string, { valor: boolean; evidencias: { idMensaje: string; fragmento: string }[] }>;
      objeciones?: Record<string, { valor: string; evidencias: { idMensaje: string; fragmento: string }[]; tipo?: string }>;
    } | null = null;
    try {
    if (!result) {
      if (!options.apiKey)
        throw new Error('Proveedor no disponible');
      result = await negotiate(trusted, options, catalog, true);
    }
    if (explicitConfirmation) {
      const current = evidencias[evidencias.length - 1];
      const item = previousFields[confirmationField!];
      interpretacionR7 = { campos: { [confirmationField!]: { valor: item.valor, tipo: 'confirmado', evidencias: [...item.evidencias.slice(0, 4), { idMensaje: current.idMensaje, fragmento: input.message }] } }, senales: {} };
    } else if (explicitHuman) {
      const current = evidencias[evidencias.length - 1];
      interpretacionR7 = { campos: {}, senales: { solicita_asesor: { valor: true, evidencias: [{ idMensaje: current.idMensaje, fragmento: input.message }] } } };
    } else if (greeting || paymentOnly) {
      interpretacionR7 = null;
    } else {
      if (!options.apiKey) throw new Error('Proveedor no disponible');
      interpretacionR7 = await interpretCommercial(input.message, evidencias, options, begin.calificacionAnterior, catalog);
      const interpretedService = interpretacionR7.campos.servicio?.valor;
      if (interpretedService && !catalog.some(item => item.id === interpretedService)) {
        delete interpretacionR7.campos.servicio;
      }
      if (!Object.keys(interpretacionR7.campos).length && !Object.keys(interpretacionR7.senales).length && !Object.keys(interpretacionR7.objeciones || {}).length) {
        interpretacionR7 = null;
      }
    }
    } catch (error) {
      if (!mixedHuman) throw error;
      result = { ...humanResult(trusted.state), reply: 'No pude procesar el resto de tu consulta. Puedes continuar con un asesor humano.' };
      const current = evidencias[evidencias.length - 1];
      interpretacionR7 = { campos: {}, senales: { solicita_asesor: { valor: true, evidencias: [{ idMensaje: current.idMensaje, fragmento: input.message }] } } };
    }
    if (paymentQuestion(input.message)) {
      result.reply = paymentModes;
      result.proposal = null;
    }
    result.state = { ...result.state, catalogMode: true, discount: 0, packageVersion: catalog.find(item => item.id === result.state.service)?.version || null };
    if (changed && selected && result.state.service === selected.id && !result.state.humanRequested) {
      const wasAccepting = result.readyForHandoff;
      result.state.buyIntent = false;
      result.state.stage = qualifyStage(result.state);
      if (wasAccepting) {
        result.reply = `Te muestro el contenido y el precio actuales de ${selected.name} en la propuesta. ¿Quieres continuar con estas condiciones?`;
        result.quickReplies = ['Quiero continuar con un asesor', '¿Qué incluye el servicio?'];
      }
      result.readyForHandoff = false;
    }

return {...result, ...(interpretacionR7 ? {interpretacionR7} : {})};
}
