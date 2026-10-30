export enum CondicionAcademica {
  ESTUDIANTE = 'estudiante',
  EGRESADO = 'egresado',
  BACHILLER = 'bachiller',
}

export enum CanalContacto {
  WHATSAPP = 'whatsapp',
  CORREO = 'correo',
  INSTAGRAM = 'instagram',
  FACEBOOK = 'facebook',
  TIKTOK = 'tiktok',
  LINKEDIN = 'linkedin',
  WEB_CHAT = 'web_chat',
  LLAMADA = 'llamada',
  PRESENCIAL = 'presencial',
}

export enum CanalOrigenSesion {
  RED_SOCIAL = 'red_social',
  REFERIDO = 'referido',
  DIRECTO = 'directo',
  BUSQUEDA = 'busqueda',
  CORREO = 'correo',
  WHATSAPP = 'whatsapp',
  CONVENIO_INSTITUCIONAL = 'convenio_institucional',
  OTRO = 'otro',
}

export enum TipoRemitente {
  LEAD = 'lead',
  AGENTE_IA = 'agente_ia',
  HUMANO = 'humano',
}

export enum TipoAgente {
  MARKETING = 'marketing',
  NEGOCIADOR = 'negociador',
}

export enum RolUsuario {
  ADMINISTRADOR = 'administrador',
  COMMUNITY_MANAGER = 'community_manager',
  ASESOR_COMERCIAL = 'asesor_comercial',
  ASESOR_METODOLOGICO = 'asesor_metodologico',
  INVESTIGADOR = 'investigador',
}

export enum TipoContenido {
  POST = 'post',
  HISTORIA = 'historia',
  REEL = 'reel',
  CARRUSEL = 'carrusel',
  ARTICULO = 'articulo',
  FAQ = 'faq',
}

export enum EstadoPublicacion {
  IDEA = 'idea',
  PROGRAMADA = 'programada',
  PUBLICADA = 'publicada',
  DESCARTADA = 'descartada',
}

export enum TipoConceptoVisual {
  LOGO = 'logo',
  PALETA = 'paleta',
  TIPOGRAFIA = 'tipografia',
  ESTILO = 'estilo',
  PLANTILLA = 'plantilla',
}

export enum EstadoConversacion {
  ABIERTA = 'abierta',
  DERIVADA = 'derivada',
  CERRADA = 'cerrada',
}

export enum EstadoDerivacion {
  PENDIENTE = 'pendiente',
  EN_ATENCION = 'en_atencion',
  RESUELTA = 'resuelta',
}

export enum ModeloCobro {
  PAGO_UNICO = 'pago_unico',
  POR_ETAPA = 'por_etapa',
  POR_CICLO = 'por_ciclo',
}

export enum ModalidadServicio {
  VIRTUAL = 'virtual',
  PRESENCIAL = 'presencial',
  HIBRIDA = 'hibrida',
}

export enum EstadoPropuesta {
  BORRADOR = 'borrador',
  ENVIADA = 'enviada',
  ACEPTADA = 'aceptada',
  RECHAZADA = 'rechazada',
  VENCIDA = 'vencida',
}

export enum TipoObjecion {
  PRECIO = 'precio',
  TIEMPO = 'tiempo',
  MODALIDAD = 'modalidad',
  ALCANCE = 'alcance',
  CONDICIONES = 'condiciones',
  CONFIANZA = 'confianza',
  OTRA = 'otra',
}

export enum EstadoSeguimiento {
  PROGRAMADO = 'programado',
  ENVIADO = 'enviado',
  RESPONDIDO = 'respondido',
  CANCELADO = 'cancelado',
}

export enum MetodoPago {
  YAPE = 'yape',
  PLIN = 'plin',
  TRANSFERENCIA = 'transferencia',
  DEPOSITO = 'deposito',
  TARJETA = 'tarjeta',
  EFECTIVO = 'efectivo',
}

export enum EstadoPago {
  PENDIENTE = 'pendiente',
  CONFIRMADO = 'confirmado',
  RECHAZADO = 'rechazado',
  REEMBOLSADO = 'reembolsado',
}

export enum Semaforo {
  ROJO = 'rojo',
  AMARILLO = 'amarillo',
  VERDE = 'verde',
}
