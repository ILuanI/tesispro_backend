// @ts-nocheck -- Pruebas de comportamiento portadas desde el frontend (antes la negociación
// se ejecutaba en Astro). Los estados parciales se construyen a mano a propósito.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as server from './commercial.js';
import * as domain from './state.js';

const facts = overrides => ({ kind: 'business', name: null, university: null, degree: null, thesisStage: null, need: null, deadline: null,
  service: null, intent: 'unchanged', human: false, objection: 'none', ...overrides });
const turn = (state, message, extraction) => server.applyExtraction({ state, message, history: [] }, server.extractionSchema.parse(facts(extraction)));
const qualified = (service = 'etapas') => ({ ...domain.initialState(), need: 'Revisar metodología', thesisStage: 'Desarrollo de tesis', service });
const noProvider = { apiKey: '', provider: 'gemini', fetchImpl: () => { throw Error('Una regla local no debe invocar al proveedor'); } };
const localTurn = (state, message) => server.negotiate({ state, message, history: [] }, noProvider);

test('recoge necesidad, recuerda universidad y pide solo la etapa desconocida', () => {
  let next = turn(domain.initialState(), 'Estoy en la UCV y necesito estadística', { university: 'UCV', need: 'Análisis estadístico', service: 'puntual' });
  assert.equal(next.state.stage, 'QUALIFY');
  assert.equal(next.state.university, 'UCV');
  assert.ok(next.reply.includes('etapa'));
  assert.equal(next.reply.includes('universidad'), false);
  next = turn(next.state, 'Tengo observaciones', { thesisStage: 'Tengo observaciones' });
  assert.equal(next.state.stage, 'RECOMMEND_SERVICE');
  assert.equal(next.state.university, 'UCV');
  assert.equal(next.proposal.min, 150);
});

test('intención necesita contexto suficiente y conserva aceptación durante calificación', () => {
  let next = turn(domain.initialState(), 'Quiero contratar apoyo para mi tesis', { need: 'Acompañamiento', intent: 'yes' });
  assert.equal(next.readyForHandoff, false);
  next = turn(next.state, 'Desarrollo de tesis', { thesisStage: 'Desarrollo de tesis', service: 'etapas' });
  assert.equal(next.readyForHandoff, true);
  assert.equal(next.state.stage, 'READY_TO_CLOSE');
  next = turn(qualified(), 'Me interesa, quiero continuar', { intent: 'yes' });
  assert.equal(next.readyForHandoff, true);
  next = turn(next.state, 'No quiero contratar', { intent: 'yes' });
  assert.equal(next.readyForHandoff, false);
  assert.equal(next.state.buyIntent, false);
});

test('precios canónicos, descuento único y ausencia de acumulación', () => {
  for (const [id, min, max] of [['puntual', 150, 150], ['etapas', 600, 1500], ['integral', 1800, 4500]]) {
    let next = turn(qualified(id), '¿Cuánto cuesta?', {});
    assert.deepEqual([next.proposal.min, next.proposal.max], [min, max]);
    next = turn(next.state, 'Está caro', { objection: 'price' });
    const expected = id === 'puntual' ? [150, 150] : [min * .9, max * .9];
    assert.deepEqual([next.proposal.min, next.proposal.max], expected);
    next = turn(next.state, 'Dame otro descuento', { objection: 'price' });
    assert.deepEqual([next.proposal.min, next.proposal.max], expected);
    assert.match(next.proposal.condition, /confirmación/);
  }
  assert.equal(domain.stateSchema.safeParse({ ...qualified(), discount: 100 }).success, false);
  assert.equal(server.extractionSchema.safeParse({ ...facts(), service: 'inventado', price: 1 }).success, false);
});

test('cambiar servicio retira el descuento y la aceptación anterior', () => {
  const next = turn({ ...qualified('integral'), discount: 10, buyIntent: true }, 'Prefiero una sesión puntual', { service: 'puntual' });
  assert.equal(next.state.discount, 0);
  assert.equal(next.state.buyIntent, false);
  assert.equal(next.proposal.min, 150);
});

test('objeciones no son aceptación y no generan promesas de entrega', () => {
  for (const objection of ['time', 'think', 'uncertain']) {
    const next = turn({ ...qualified(), buyIntent: true }, 'Tengo dudas', { objection });
    assert.equal(next.readyForHandoff, false);
    assert.equal(next.state.stage, 'HANDLE_OBJECTION');
    assert.ok(next.reply.length < 600);
  }
});

test('corrige datos explícitos, separa metodología y temas ajenos', () => {
  const state = { ...qualified(), university: 'UCV' };
  const corrected = turn(state, 'Mi universidad es UNMSM', { university: 'UNMSM' });
  assert.equal(corrected.state.university, 'UNMSM');
  const faq = turn(state, 'Explícame la regresión', { kind: 'methodology' });
  assert.equal(faq.faq, true);
  assert.equal(faq.state.need, state.need);
  assert.equal(turn(state, '¿Cómo programo un CRUD?', { kind: 'out_of_scope' }).readyForHandoff, false);
});

test('solicitar una persona o pago permite derivación inmediata sin IA', async () => {
  for (const message of ['Quiero hablar con una persona', 'Quiero hablar con alguien', '¿Cómo pago?', '¿Dónde pagar?']) {
    const next = await server.negotiate({ message, history: [], state: domain.initialState() }, { apiKey: '', provider: 'gemini', fetchImpl: () => { throw Error('Must not call'); } });
    assert.equal(next.readyForHandoff, true);
  }
  assert.equal(server.immediateHuman('No quiero hablar con una persona'), false);
});

test('aceptación local inequívoca y solicitud humana sobreviven sin nuevas llamadas', async () => {
  const options = { apiKey: '', provider: 'gemini', fetchImpl: () => { throw Error('Must not call'); } };
  const next = await server.negotiate({ message: 'Me interesa, quiero contratar', history: [], state: qualified() }, options);
  assert.equal(next.state.buyIntent, true);
  assert.equal(next.readyForHandoff, true);
  assert.equal(server.localNegotiation({ message: 'No quiero contratar', history: [], state: qualified() }), null);
  const human = server.humanResult(domain.initialState());
  const restored = domain.restoreSession(JSON.stringify({ version: 1, state: human.state, messages: [{ role: 'assistant', text: human.reply }] }));
  assert.equal(restored.state.stage, 'READY_TO_CLOSE');
});

test('modelo solo extrae hechos: su salida no puede introducir un precio o respuesta libre', async () => {
  const next = await server.negotiate({ message: 'UCV, necesito estadística', history: [], state: domain.initialState() }, {
    apiKey: 'test-only', provider: 'gemini', fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.generationConfig.responseJsonSchema.properties.price, undefined);
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(facts({ university: 'UCV', need: 'Estadística', service: 'puntual' })) }] } }] });
    },
  });
  assert.equal(next.state.university, 'UCV');
  assert.equal(next.proposal.min, 150);
});

test('interpretación comercial conserva la evidencia y las correcciones del proveedor simulado', async () => {
  const message = 'No quiero contratar, necesito análisis estadístico, pero está caro';
  const evidence = [{ idMensaje: '12', text: message }];
  const interpreted = await server.interpretCommercial(message, evidence, {
    apiKey: 'test-only', provider: 'gemini', fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.match(JSON.stringify(body.contents), /evaluacionAnterior/);
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ campos: [{ nombre: 'necesidad', valor: 'análisis estadístico', tipo: 'declarado', evidencias: [{ idMensaje: '12', fragmento: 'análisis estadístico' }] }], senales: [{ nombre: 'intencion_contratar', valor: 'false', tipo: 'inferido', evidencias: [{ idMensaje: '12', fragmento: 'No quiero contratar' }] }], objeciones: [{ nombre: 'precio', valor: 'caro', tipo: 'declarado', evidencias: [{ idMensaje: '12', fragmento: 'caro' }] }] }) }] } }] });
    },
  }, { nivel: 'intencion_contratacion' });
  assert.equal(interpreted.senales.intencion_contratar.valor, false);
  assert.equal(interpreted.campos.necesidad.evidencias[0].idMensaje, '12');
  assert.equal(interpreted.campos.necesidad.tipo, 'declarado');
  assert.equal(interpreted.objeciones.precio.valor, 'caro');
});

test('la clasificación auxiliar descarta claves y citas inventadas sin bloquear la respuesta', async () => {
  const message = '¿Cuánto cuesta?';
  const item = (nombre, fragmento, valor = 'true') => ({ nombre, valor, tipo: 'inferido', evidencias: [{ idMensaje: '12', fragmento }] });
  const interpreted = await server.interpretCommercial(message, [{ idMensaje: '12', text: message }], {
    apiKey: 'test-only', provider: 'openrouter', model: 'test/model', fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ campos: [item('necesidad', 'Necesito desarrollar toda la tesis', 'desarrollo integral')], senales: [item('consulta_precio', message), item('consulta_sesiones', message), item('intencion_contratar', 'Acepto contratar')], objeciones: [] }) } }] }),
  });
  assert.deepEqual(interpreted.campos, {});
  assert.deepEqual(Object.keys(interpreted.senales), ['consulta_precio']);
});

test('locales básicas: saludos, cortesía e identidad conservan estado sin proveedor', async () => {
  const states = [domain.initialState(), { ...qualified(), thesisStage: '', university: 'UCV' },
    { ...qualified(), stage: 'HANDLE_OBJECTION', discount: 10, objections: ['Precio'] },
    { ...qualified(), stage: 'READY_TO_CLOSE', buyIntent: true }];
  const cases = [
    ['  ¡HÓLA!  ', /Hola/], ['hola, qué tal', /Hola/], ['hola mucho gusto', /Hola/], ['buenos días', /Hola/],
    ['gracias', /Con gusto/], ['muchas gracias', /Con gusto/], ['igualmente', /Con gusto/],
    ['mucho gusto', /Hola/], ['hasta luego', /Hasta pronto/], ['adiós', /Hasta pronto/],
    ['¿Quién eres?', /Tesi.*asistente IA.*TesisPro.net/], ['¿Cómo te llamas?', /Tesi/],
    ['nombre de la empresa', /TesisPro.net/], ['¿Cómo se llama la empresa?', /TesisPro.net/],
    ['Cuándo', /inicio.*duración/], ['¿cuándo?', /inicio.*duración/],
    ['¿Qué horarios tienen?', /confirmarse.*asesor/], ['¿Cuándo empieza el servicio?', /confirmarse.*asesor/],
    ['¿Cuánto dura el servicio?', /confirmarse.*asesor/],
  ];
  for (const state of states) for (const [message, reply] of cases) {
    const snapshot = structuredClone(state);
    const next = await localTurn(state, message);
    assert.match(next.reply, reply, message);
    assert.deepEqual(next.state, snapshot, message);
    assert.deepEqual(state, snapshot, 'no muta el estado recibido');
    assert.equal(next.readyForHandoff, state.stage === 'READY_TO_CLOSE');
  }
  const greeted = await localTurn(states[1], 'Hola');
  assert.match(greeted.reply, /etapa/);
  assert.doesNotMatch(greeted.reply, /universidad|qué necesitas/i);
  const handoff = await localTurn({ ...qualified(), stage: 'HANDOFF' }, 'Hola');
  assert.match(handoff.reply, /WhatsApp/);
});

test('locales catálogo y acciones: tarifas configuradas, opciones y descuento único', async () => {
  const current = { ...qualified('integral'), stage: 'HANDLE_OBJECTION', discount: 10, objections: ['Precio'] };
  for (const [message, expected] of [
    ['¿Cuánto cuesta?', /S\/1,620–S\/4,050/], ['¿Cuánto cuesta el servicio?', /S\/1,620–S\/4,050/],
    ['¿Cuánto cuesta la asesoría puntual?', /S\/150/], ['Precio de acompañamiento por etapas', /S\/600–S\/1,500/],
    ['¿Cuánto cuesta Asesoría Integral 360°?', /S\/1,620–S\/4,050/],
    ['¿Qué incluye el servicio?', /Orientación a lo largo/], ['¿Qué servicios ofrecen?', /Asesoría Puntual.*90 minutos/s],
  ]) {
    const next = await localTurn(current, message);
    assert.match(next.reply, expected, message);
    assert.deepEqual(next.state, current, message);
    if (/cuesta|precio/i.test(message)) assert.match(next.reply, /orientativos.*confirmación/s);
    if (message === '¿Qué servicios ofrecen?') for (const name of ['Acompañamiento por Etapas', 'Asesoría Integral 360°']) assert.ok(next.reply.includes(name));
  }
  for (const message of ['¿Cuánto cuesta?', '¿Qué incluye?']) {
    const next = await localTurn(domain.initialState(), message);
    assert.equal(next.proposal, null);
    assert.equal(next.quickReplies.length, 3);
    assert.deepEqual(next.state, domain.initialState());
  }
  for (const choice of domain.initialChoices) {
    const next = await localTurn(domain.initialState(), choice);
    assert.equal(next.state.need, choice);
    assert.ok(['puntual', 'etapas', 'integral'].includes(next.state.service));
    assert.equal(next.readyForHandoff, false);
  }
  for (const stage of domain.thesisStages) {
    const next = await localTurn({ ...qualified(), thesisStage: '', university: 'UCV' }, stage);
    assert.equal(next.state.thesisStage, stage);
    assert.equal(next.state.university, 'UCV');
    assert.equal(next.state.stage, 'RECOMMEND_SERVICE');
  }
  for (const [choice, id, min, max] of [
    ['Busco una sesión puntual', 'puntual', 150, 150],
    ['Busco acompañamiento por etapas', 'etapas', 600, 1500],
    ['Busco acompañamiento integral', 'integral', 1800, 4500],
  ]) {
    let next = await localTurn({ ...qualified('integral'), buyIntent: true, discount: 10 }, choice);
    assert.equal(next.state.service, id);
    if (id !== 'integral') assert.equal(next.state.buyIntent, false);
    for (const message of ['Está caro', 'Quiero un descuento', 'Dame otro descuento']) {
      next = await localTurn(next.state, message);
      assert.deepEqual([next.proposal.min, next.proposal.max], id === 'puntual' ? [min, max] : [min * .9, max * .9]);
      assert.equal(next.state.buyIntent, false);
      assert.equal(next.state.objections.filter(item => item === 'Precio').length, 1);
    }
  }
  for (const message of ['Lo voy a pensar', 'Tengo poco tiempo', 'No sé si me sirve']) {
    const next = await localTurn({ ...qualified(), buyIntent: true }, message);
    assert.equal(next.state.stage, 'HANDLE_OBJECTION');
    assert.equal(next.state.buyIntent, false);
  }
  assert.equal((await localTurn(qualified(), 'Quiero continuar con un asesor')).readyForHandoff, true);
  assert.equal((await localTurn(domain.initialState(), 'Quiero hablar con una persona')).readyForHandoff, true);
  assert.deepEqual((await localTurn(current, 'Quiero revisar otra opción')).state, current);
});

test('mensajes mixtos o ambiguos llegan al proveedor simulado sin interceptarse', async () => {
  const cases = ['Hola, soy Juan de la UCV y necesito estadística', 'Hola qué tal, tengo observaciones',
    'Gracias, mi universidad es UCV', 'Gracias, pero no quiero contratar', '¿Cuándo y cuánto cuesta?',
    '¿Cuánto cuesta si cambio a integral?', '¿Qué incluye y puedo pagar después?',
    'No quiero contratar', 'Si baja el precio, acepto', 'No es UCV, es UNMSM',
    '¿Cuánto cuesta estadística?', 'Hola necesito acompañamiento y tengo dos semanas'];
  let calls = 0;
  const sentinel = new Error('Proveedor simulado: interpretación contextual');
  for (const message of cases) {
    const state = qualified();
    assert.equal(server.localNegotiation({ message, history: [], state }), null, message);
    await assert.rejects(server.negotiate({ message, history: [], state }, {
      apiKey: 'test-only', provider: 'gemini', fetchImpl: () => { calls++; throw sentinel; },
    }), error => error === sentinel);
    assert.deepEqual(state, qualified());
  }
  assert.equal(calls, cases.length);
});
