// Proveedor simulado para la prueba de navegador; nunca se usa en el servidor real.
const original = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('https://generativelanguage.googleapis.com/')) return original(url, options);
  const request = JSON.parse(options.body);
  const input = JSON.parse(request.contents[0].parts[0].text);
  if(request.generationConfig.responseJsonSchema.properties.ids) return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({ids:[input.componentes[0].idServicio],texto:'Asesoría académica personalizada según la necesidad identificada.'})}]}}]});
  const commercial = !!request.generationConfig.responseJsonSchema.properties.campos;
  const message = commercial ? input.mensajes.at(-1) : null;
  const result = commercial ? {
    campos: [
      { nombre: 'necesidad', valor: 'análisis estadístico', evidencias: [{ idMensaje: message.idMensaje, fragmento: 'análisis estadístico' }] },
      { nombre: 'etapa', valor: 'desarrollo', evidencias: [{ idMensaje: message.idMensaje, fragmento: 'tesis en desarrollo' }] },
      { nombre: 'servicio', valor: 'puntual', evidencias: [{ idMensaje: message.idMensaje, fragmento: 'análisis estadístico' }] },
    ],
    senales: [{ nombre: 'consulta_precio', valor: 'true', evidencias: [{ idMensaje: message.idMensaje, fragmento: 'precio' }] }],
    objeciones: [],
  } : { kind: 'business', name: null, university: null, degree: 'maestría', thesisStage: 'desarrollo', need: 'análisis estadístico', deadline: null, service: 'puntual', intent: 'unchanged', human: false, objection: 'none' };
  return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(result) }] } }] });
};
