// Contenido y tarifas históricas del prototipo. R11 no las usa como respaldo comercial:
// el endpoint de Tesi y sus propuestas en navegador requieren paquetes autorizados de PostgreSQL.
export const services = [
  {
    id: 'puntual', name: 'Asesoría Puntual', banner: 'SESIÓN PUNTUAL', eyebrow: 'PARA BLOQUEOS O REVISIÓN RÁPIDA',
    description: 'Resolución de observaciones específicas del jurado, corrección metodológica puntual o procesamiento estadístico concentrado.',
    features: ['Sesión sincrónica 1 a 1 de 90 min con grabación', 'Levantamiento punto por punto de observaciones', 'Tratamiento estadístico (SPSS, R o Jamovi)', 'Validación de instrumentos y juicio de expertos'],
    commercialDescription: 'Sesión de 90 minutos para una dificultad puntual, observaciones específicas, revisión metodológica o estadística.',
    minPrice: 150, maxPrice: 150, unit: 'por sesión de 90 minutos', maxDiscount: 0,
  },
  {
    id: 'etapas', name: 'Acompañamiento por Etapas', banner: 'ACOMPAÑAMIENTO MODULAR', eyebrow: 'OPCIÓN MÁS SOLICITADA',
    description: 'Dirección paso a paso capítulo por capítulo con entregables semanales verificables y reuniones de retroalimentación continua.',
    features: ['Módulo 1: Plan o Proyecto de Tesis Inicial', 'Módulo 2: Marco Teórico & Estado del Arte', 'Módulo 3: Marco Metodológico & Muestra', 'Módulo 4: Análisis de Resultados & Discusión'],
    commercialDescription: 'Acompañamiento de una etapa o capítulo: proyecto, marco teórico, metodología o análisis de resultados.',
    minPrice: 600, maxPrice: 1500, unit: 'por etapa', maxDiscount: 10,
  },
  {
    id: 'integral', name: 'Asesoría Integral 360°', banner: 'PROGRAMA INTEGRAL 360°', eyebrow: 'DIRECCIÓN HASTA LA TITULACIÓN',
    description: 'Acompañamiento holístico total desde la formulación del tema hasta la sustentación triunfal con simulacro de jurado.',
    features: ['Mentoring 1 a 1 ilimitado hasta sustentar', 'Informes Turnitin oficiales antiplagio en cada versión', 'Elaboración de diapositivas y simulacro de jurado', 'Garantía de subsanación de correcciones sin costo'],
    commercialDescription: 'Orientación a lo largo del proceso de tesis, desde el tema hasta la preparación de sustentación, con revisión metodológica y simulacros.',
    minPrice: 1800, maxPrice: 4500, unit: 'por acompañamiento integral', maxDiscount: 10,
  },
] as const;

export type ServiceId = typeof services[number]['id'];
export const proposalCondition = 'Importes orientativos y condiciones provisionales, sujetos a evaluación y confirmación de un asesor humano. No constituyen una reserva ni una contratación.';
