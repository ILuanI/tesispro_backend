// @ts-nocheck -- Pruebas del catálogo R11 en la negociación, portadas desde el frontend.
import assert from "node:assert/strict";
import { test } from "vitest";
import * as shared from "./packages.js";
import * as domain from "./state.js";
import * as server from "./commercial.js";

const fixture = {
  idServicio: 90,
  codigo: "SOLO_TEST",
  nombre: "Paquete ficticio de prueba",
  descripcion: "Uso exclusivo en tests",
  publicoObjetivo: null,
  componentes: [
    {
      idServicio: 1,
      cantidad: 1,
      nombre: "Servicio de prueba",
      codigo: "TEST",
    },
  ],
  entregables: ["Entrega test"],
  restricciones: ["Restricción test"],
  precioFijo: "500.25",
  moneda: "PEN",
  modalidad: "virtual",
  duracionDias: null,
  vigenciaDesde: null,
  vigenciaHasta: null,
  version: 1,
};
const catalog = shared.packageServices([fixture]);
const state = () => ({
  ...domain.initialState(),
  catalogMode: true,
  service: "paquete-90",
  packageVersion: 1,
  need: "Revisión",
  thesisStage: "Desarrollo de tesis",
});
test("R11 explica restricciones y entregables configurados sin añadir promesas", () => {
  const r = server.localNegotiation(
    { state: state(), message: "¿Qué restricciones tiene?", history: [] },
    catalog,
  );
  assert.match(r.reply, /Restricción test/);
  const d = server.localNegotiation(
    { state: state(), message: "¿Qué entregables incluye?", history: [] },
    catalog,
  );
  assert.match(d.reply, /Entrega test/);
});
test("R11 catálogo vacío mantiene derivación humana y no presenta importes", async () => {
  const input = {
    message: "¿Qué precio tienen?",
    history: [],
    state: { ...state(), service: null },
  };
  const turn = await server.negotiate(
    input,
    {
      apiKey: "",
      provider: "gemini",
      fetchImpl: () => {
        throw Error("No debe llamar IA");
      },
    },
    [],
  );
  assert.equal(turn.proposal, null);
  assert.match(turn.reply, /No hay paquetes/);
  assert.ok(!turn.reply.includes("S/"));
  const human = server.localNegotiation(
    { ...input, message: "Quiero hablar con una persona" },
    [],
  );
  assert.equal(human.readyForHandoff, true);
});
test("R11 IA recibe solo IDs autorizados y un ID inventado nunca selecciona un paquete", async () => {
  const next = await server.negotiate(
    {
      message: "Soy Ana de la UCV y quiero orientación personalizada",
      history: [],
      state: { ...state(), service: null },
    },
    {
      apiKey: "test-only",
      provider: "gemini",
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        assert.deepEqual(
          body.generationConfig.responseJsonSchema.properties.service.enum,
          ["paquete-90", null],
        );
        return Response.json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      kind: "business",
                      name: "Ana",
                      university: "UCV",
                      degree: null,
                      thesisStage: null,
                      need: null,
                      deadline: null,
                      service: "paquete-999",
                      intent: "unchanged",
                      human: false,
                      objection: "none",
                      reply: "Puedo orientarte con los paquetes publicados. ¿Qué necesitas revisar?",
                      quickReplies: [],
                    }),
                  },
                ],
              },
            },
          ],
        });
      },
    },
    catalog,
  );
  assert.equal(next.state.service, null);
  assert.equal(next.state.name, "Ana");
  assert.equal(next.proposal, null);
});

test('Tesi responde una duda de tesis en el chat, recomienda el paquete y conserva el contexto', async () => {
  const reply = 'La matriz relaciona problema, objetivos e hipótesis. El paquete de prueba permite revisar tu avance. ¿Ya tienes un tema?';
  const next = await server.negotiate({ message: '¿Para qué sirve la matriz de consistencia?', state: state(), history: [{ role: 'user', text: 'Estoy desarrollando mi tesis' }] }, {
    apiKey: 'test-only', provider: 'openrouter', model: 'test/model', fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.response_format.json_schema.name, 'tesi_conversation');
      const context = JSON.parse(body.messages[1].content);
      assert.equal(context.history[0].text, 'Estoy desarrollando mi tesis');
      assert.equal(context.catalog[0].precio, 500.25);
      assert.equal(context.catalog[0].guiaRecomendacion, 'Recomendar por necesidad, no por precio.');
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ kind: 'business', name: null, university: null, degree: null, thesisStage: null, need: null, deadline: null, service: 'paquete-90', intent: 'unchanged', human: false, objection: 'none', reply, quickReplies: ['Ya tengo un tema'] }) } }] });
    },
  }, catalog.map(item => ({ ...item, recommendationGuide: 'Recomendar por necesidad, no por precio.' })), true);
  assert.equal(next.reply, reply);
  assert.equal(next.faq, false);
  assert.equal(next.state.service, 'paquete-90');
  assert.deepEqual(next.recommendedPackage, { id: 'paquete-90', version: 1 });
  assert.equal(next.proposal.min, 500.25);
  assert.deepEqual(next.quickReplies, ['Ya tengo un tema']);
});
