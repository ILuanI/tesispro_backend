import 'reflect-metadata';
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import source from '../dist/database/typeorm.config.js';
import { seed, seedEmails } from './seed.mjs';
import { KnowledgeService } from '../dist/modules/knowledge/knowledge.service.js';
import { ReferralsService } from '../dist/modules/admin/referrals.service.js';
import { AttentionService } from '../dist/modules/agents/attention.service.js';

// Complementa la carga inicial (seed.mjs) con los módulos que esta no cubre:
// catálogo académico, marketing, agentes IA, KPIs, objeciones, derivaciones,
// consentimientos, descargas, referidos y orquestación de agentes.
const loadKey = 'modulos-complementarios-2026-v1';
const baseKey = 'crm-inicial-2026-v1';

export async function seedModules(db) {
  return db.transaction(async m => {
    await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [loadKey]);
    const [previous] = await m.query('SELECT resultado FROM carga_inicial WHERE clave=$1', [loadKey]);
    if (previous) return { estado: 'ya_cargado', ...previous.resultado };
    const [base] = await m.query('SELECT 1 FROM carga_inicial WHERE clave=$1', [baseKey]);
    if (!base) throw new Error('Ejecuta primero la carga inicial (seed.mjs).');
    const [active] = await m.query('SELECT release_id FROM knowledge_active WHERE id=1');
    if (!active) throw new Error('Publica primero la base de conocimiento (knowledge:bootstrap).');
    const [admin] = await m.query("SELECT id_usuario FROM usuario_interno WHERE activo AND rol='administrador' ORDER BY id_usuario LIMIT 1");
    const [sales] = await m.query("SELECT id_usuario FROM usuario_interno WHERE activo AND rol='asesor_comercial' ORDER BY id_usuario LIMIT 1");
    const user = admin.id_usuario;
    const scoped = { manager: m, query: (sql, params) => m.query(sql, params), transaction: (...args) => args.at(-1)(m) };
    const insert = async (table, fields, conflict = '') => {
      const cols = Object.keys(fields);
      return (await m.query(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map((_, i) => '$' + (i + 1)).join(',')}) ${conflict} RETURNING *`, Object.values(fields)))[0];
    };
    const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const day = offset => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
    const at = (offset, hour = '10:00') => `${day(offset)}T${hour}:00-05:00`;
    const result = { universidades: 0, facultades: 0, programas: 0, directivas: 0, convenios: 0, agentes: 0, plataformas: 0, cuentas: 0,
      campanas: 0, conceptos: 0, publicaciones: 0, kpis: 0, mediciones: 0, objeciones: 0, objecionesLead: 0, derivaciones: 0,
      consentimientos: 0, descargas: 0, enlacesReferido: 0, atribuciones: 0, contextosReferido: 0, ejecucionesAgente: 0,
      solicitudesAgente: 0, eventosAgente: 0, recordatorios: 0, usoConocimiento: 0 };

    // --- Catálogo académico ---
    const grades = Object.fromEntries((await m.query('SELECT codigo,id_grado FROM grado_academico')).map(g => [g.codigo, g.id_grado]));
    const catalog = [
      ['Universidad Nacional Mayor de San Marcos', 'UNMSM', 'publica', 'Lima', 'Lima', 'https://www.unmsm.edu.pe',
        [['Facultad de Ciencias Administrativas', ['Administración', 'Gestión Pública']], ['Facultad de Educación', ['Educación', 'Docencia Universitaria']]]],
      ['Universidad Nacional de Ingeniería', 'UNI', 'publica', 'Lima', 'Lima', 'https://www.uni.edu.pe',
        [['Facultad de Ingeniería Industrial y de Sistemas', ['Ingeniería Industrial', 'Ingeniería de Sistemas']], ['Facultad de Ingeniería Civil', ['Ingeniería Civil', 'Gestión de Proyectos']]]],
      ['Universidad Nacional de San Agustín de Arequipa', 'UNSA', 'publica', 'Arequipa', 'Arequipa', 'https://www.unsa.edu.pe',
        [['Facultad de Ciencias Contables y Financieras', ['Contabilidad', 'Finanzas']], ['Facultad de Psicología', ['Psicología', 'Psicología Organizacional']]]],
      ['Universidad Nacional de Trujillo', 'UNT', 'publica', 'La Libertad', 'Trujillo', 'https://www.unitru.edu.pe',
        [['Facultad de Ciencias Económicas', ['Economía', 'Administración']], ['Facultad de Enfermería', ['Enfermería', 'Salud Pública']]]],
      ['Universidad de Piura', 'UDEP', 'privada', 'Piura', 'Piura', 'https://www.udep.edu.pe',
        [['Facultad de Ciencias Económicas y Empresariales', ['Administración de Empresas', 'Dirección de Empresas']]]],
    ];
    const universityIds = [];
    const facultyIds = [];
    for (const [nombre, siglas, tipo, departamento, ciudad, web, faculties] of catalog) {
      let u = await insert('universidad', { nombre, siglas, tipo_gestion: tipo, departamento, ciudad, sitio_web: web }, 'ON CONFLICT (nombre) DO NOTHING');
      if (u) result.universidades++; else [u] = await m.query('SELECT * FROM universidad WHERE nombre=$1', [nombre]);
      universityIds.push(u.id_universidad);
      for (const [facultad, programs] of faculties) {
        let f = await insert('facultad', { id_universidad: u.id_universidad, nombre: facultad }, 'ON CONFLICT (id_universidad,nombre) DO NOTHING');
        if (f) result.facultades++; else [f] = await m.query('SELECT * FROM facultad WHERE id_universidad=$1 AND nombre=$2', [u.id_universidad, facultad]);
        facultyIds.push(f.id_facultad);
        const [pre, post] = programs;
        for (const [grade, name] of [['pregrado', pre], ['maestria', `Maestría en ${post}`]]) {
          if (await insert('programa_academico', { id_facultad: f.id_facultad, id_grado: grades[grade], nombre: name }, 'ON CONFLICT DO NOTHING')) result.programas++;
        }
        for (const [grade, threshold] of [['pregrado', 25], ['maestria', 20]]) {
          const saved = await insert('directiva_tesis', { id_facultad: f.id_facultad, id_grado: grades[grade], version: '1.0',
            estructura_tesis: JSON.stringify(['Introducción', 'Marco teórico', 'Metodología', 'Resultados', 'Discusión', 'Conclusiones', 'Referencias']),
            esquema_documentario: JSON.stringify({ normaCitas: 'APA 7', interlineado: 1.5, fuente: 'Times New Roman 12' }),
            umbral_similitud_pct: threshold, exige_deteccion_ia: grade === 'maestria', vigente_desde: '2026-01-01', vigente: true,
            notas: 'Referencia general; confirmar con el reglamento vigente de la facultad.' }, 'ON CONFLICT DO NOTHING');
          if (saved) result.directivas++;
        }
      }
    }
    for (const [i, [nombre, descripcion]] of [
      ['Convenio de acompañamiento a egresados', 'Talleres de metodología y descuentos para egresados en proceso de titulación.'],
      ['Programa de apoyo a la investigación', 'Charlas sobre elaboración de proyectos de tesis para estudiantes de último ciclo.'],
    ].entries()) {
      await insert('convenio_institucional', { id_universidad: universityIds[i * 2], nombre, descripcion, fecha_inicio: '2026-03-01', fecha_fin: '2027-02-28', activo: true });
      result.convenios++;
    }

    // --- Agentes IA ---
    const agentIds = {};
    for (const [tipo, nombre, descripcion] of [
      ['marketing', 'Agente de marketing', 'Orienta sobre servicios públicos y recursos aprobados.'],
      ['negociador', 'Agente negociador', 'Interpreta necesidades e intención de compra con evidencia.'],
      ['cobranza', 'Agente de cobranza', 'Explica modalidades de pago y registra solicitudes para revisión.'],
      ['academico', 'Agente académico', 'Responde con conocimiento académico aprobado y fuentes.'],
      ['postventa', 'Agente de postventa', 'Recoge incidencias y solicitudes de continuidad.'],
    ]) {
      let a = await insert('agente_ia', { nombre, tipo, modelo: 'claude-sonnet-5-5', version: '1', descripcion, activo: true }, 'ON CONFLICT (nombre) DO NOTHING');
      if (a) result.agentes++; else [a] = await m.query('SELECT * FROM agente_ia WHERE nombre=$1', [nombre]);
      agentIds[tipo] = a.id_agente;
    }

    // --- Marketing ---
    const accounts = [];
    for (const [plataforma, usuario, url] of [
      ['Facebook', 'TesisPro', 'https://www.facebook.com/tesispro'], ['Instagram', '@tesispro', 'https://www.instagram.com/tesispro'],
      ['TikTok', '@tesispro', 'https://www.tiktok.com/@tesispro'], ['LinkedIn', 'TesisPro', 'https://www.linkedin.com/company/tesispro'],
    ]) {
      let p = await insert('plataforma', { nombre: plataforma }, 'ON CONFLICT (nombre) DO NOTHING');
      if (p) result.plataformas++; else [p] = await m.query('SELECT * FROM plataforma WHERE nombre=$1', [plataforma]);
      accounts.push((await insert('cuenta_red_social', { id_plataforma: p.id_plataforma, nombre_usuario: usuario, url, activa: true })).id_cuenta);
      result.cuentas++;
    }
    const campaigns = [];
    for (const [i, [nombre, objetivo, utm, presupuesto]] of [
      ['Tesis con rumbo', 'Captar egresados que inician su proyecto de tesis.', 'tesis-con-rumbo', '1200.00'],
      ['Avanza tu investigación', 'Reactivar estudiantes con proyectos detenidos.', 'avanza-tu-investigacion', '900.00'],
      ['Preparación de sustentación', 'Acompañar a tesistas próximos a sustentar.', 'preparacion-sustentacion', '600.00'],
    ].entries()) {
      let c = await insert('campana', { nombre, objetivo, fecha_inicio: day(-45 + i * 10), fecha_fin: day(30 + i * 15), utm_campaign: utm, presupuesto, activa: true }, 'ON CONFLICT (utm_campaign) DO NOTHING');
      if (c) result.campanas++; else [c] = await m.query('SELECT * FROM campana WHERE utm_campaign=$1', [utm]);
      campaigns.push(c.id_campana);
    }
    const concepts = [];
    for (const [tipo, nombre, descripcion, valor] of [
      ['logo', 'Logotipo principal', 'Isotipo de birrete con trazo de libro abierto.', { archivo: 'logo-principal.svg' }],
      ['paleta', 'Paleta institucional', 'Azul académico con acentos en ámbar.', { primario: '#1E3A8A', secundario: '#F59E0B', fondo: '#F8FAFC' }],
      ['tipografia', 'Tipografía de marca', 'Sans serif legible para piezas digitales.', { titulos: 'Poppins', texto: 'Inter' }],
      ['estilo', 'Estilo fotográfico', 'Estudiantes reales en contextos de estudio, luz natural.', { tono: 'cercano', filtros: false }],
      ['plantilla', 'Plantilla de carrusel', 'Carrusel de 6 láminas con portada, pasos y llamado a la acción.', { laminas: 6, formato: '1080x1350' }],
    ]) {
      concepts.push((await insert('concepto_visual', { id_agente: agentIds.marketing, tipo, nombre, descripcion, valor: JSON.stringify(valor), aprobado: tipo !== 'estilo', aprobado_por: tipo !== 'estilo' ? user : null })).id_concepto);
      result.conceptos++;
    }
    const posts = [
      ['carrusel', '5 pasos para elegir tu tema de tesis', 'Descarga la guía gratuita', 'publicada'],
      ['reel', '¿Tu matriz de consistencia está completa?', 'Revisa la lista de verificación', 'publicada'],
      ['post', 'Errores comunes en el marco teórico', 'Agenda una asesoría', 'publicada'],
      ['historia', 'Pregunta del día: ¿en qué etapa estás?', 'Responde la encuesta', 'publicada'],
      ['articulo', 'Cómo organizar tu cronograma de tesis', 'Lee el artículo completo', 'publicada'],
      ['faq', '¿Puedo recibir asesoría si trabajo a tiempo completo?', 'Escríbenos por WhatsApp', 'publicada'],
      ['carrusel', 'Prepara tu sustentación en 4 semanas', 'Descarga la guía', 'programada'],
      ['reel', 'Testimonio: de bachiller a titulado', 'Conoce los servicios', 'programada'],
      ['post', 'Checklist antes de enviar tu proyecto al asesor', null, 'idea'],
      ['historia', 'Mitos sobre el software antiplagio', null, 'descartada'],
    ];
    for (const [i, [tipo, titulo, cta, estado]] of posts.entries()) {
      const published = estado === 'publicada';
      const reach = published ? 1800 + i * 640 : 0;
      await insert('publicacion', { id_cuenta: accounts[i % accounts.length], id_campana: campaigns[i % 3], id_concepto: concepts[4 - (i % 2)], id_agente: i % 2 ? agentIds.marketing : null,
        tipo_contenido: tipo, titulo, texto: `${titulo}. Contenido orientado a estudiantes y egresados en proceso de titulación.`, llamado_accion: cta, estado,
        fecha_programada: estado === 'idea' || estado === 'descartada' ? null : at(published ? -30 + i * 4 : 3 + i, '19:00'),
        fecha_publicacion: published ? at(-30 + i * 4, '19:00') : null, url: published ? `https://www.instagram.com/p/tesispro${i + 1}` : null,
        impresiones: published ? Math.round(reach * 1.6) : 0, alcance: reach, likes: published ? 90 + i * 23 : 0, comentarios: published ? 6 + i * 2 : 0,
        compartidos: published ? 4 + i : 0, clics: published ? 35 + i * 11 : 0, generada_por_ia: i % 2 === 1 });
      result.publicaciones++;
    }

    const resources = await m.query('SELECT id_recurso FROM recurso_gratuito WHERE activo ORDER BY id_recurso LIMIT 4');
    for (const [i, r] of resources.entries()) {
      for (const [j, canal] of ['instagram', 'facebook'].entries()) {
        await insert('enlace_recurso', { codigo: randomBytes(12).toString('hex'), id_recurso: r.id_recurso, canal, clics: 40 + i * 17 + j * 9 });
        result.enlacesRecurso = (result.enlacesRecurso ?? 0) + 1;
      }
    }

    // --- KPIs ---
    const kpis = [
      ['tasa_captacion', 'Tasa de captación', 1, 'leads / visitas a landing * 100', '%', 5, 12, true],
      ['costo_por_lead', 'Costo por lead', 1, 'inversión en campañas / leads', 'PEN', 25, 12, false],
      ['tasa_respuesta_24h', 'Respuesta en menos de 24 h', 1, 'leads atendidos en 24 h / leads * 100', '%', 70, 90, true],
      ['engagement_redes', 'Engagement en redes', 1, '(likes + comentarios + compartidos) / alcance * 100', '%', 2, 5, true],
      ['tasa_conversion', 'Conversión a cliente', 2, 'clientes / leads calificados * 100', '%', 10, 25, true],
      ['ticket_promedio', 'Ticket promedio', 2, 'monto contratado / contratos', 'PEN', 900, 1500, true],
      ['morosidad', 'Morosidad', 2, 'cuotas vencidas / cuotas exigibles * 100', '%', 30, 10, false],
      ['propuestas_aceptadas', 'Propuestas aceptadas', 2, 'propuestas aceptadas / propuestas presentadas * 100', '%', 30, 55, true],
    ];
    for (const [k, [codigo, nombre, fase, formula, unidad, rojo, verde, mejor]] of kpis.entries()) {
      let def = await insert('kpi_definicion', { codigo, nombre, fase, formula, unidad, umbral_rojo: rojo, umbral_verde: verde, mayor_es_mejor: mejor, descripcion: `Indicador de ${nombre.toLowerCase()}.` }, 'ON CONFLICT (codigo) DO NOTHING');
      if (def) result.kpis++; else [def] = await m.query('SELECT * FROM kpi_definicion WHERE codigo=$1', [codigo]);
      for (let w = 5; w >= 0; w--) {
        const progress = (5 - w) / 5;
        const start = mejor ? rojo * 0.8 : rojo * 1.15;
        const end = mejor ? verde * 1.05 : verde * 0.95;
        const valor = Math.round((start + (end - start) * progress + ((k + w) % 3 - 1) * Math.abs(verde - rojo) * 0.05) * 100) / 100;
        const good = mejor ? valor >= verde : valor <= verde;
        const bad = mejor ? valor <= rojo : valor >= rojo;
        await insert('kpi_medicion', { id_kpi: def.id_kpi, periodo_inicio: day(-7 * w - 6), periodo_fin: day(-7 * w), valor, semaforo: good ? 'verde' : bad ? 'rojo' : 'amarillo',
          id_campana: codigo === 'costo_por_lead' || codigo === 'tasa_captacion' ? campaigns[w % 3] : null,
          id_agente: codigo === 'tasa_respuesta_24h' ? agentIds.negociador : codigo === 'morosidad' ? agentIds.cobranza : null });
        result.mediciones++;
      }
    }

    // --- Objeciones ---
    const objections = {};
    for (const [tipo, descripcion, respuesta] of [
      ['precio', 'El precio supera mi presupuesto', 'Ofrecer el pago en cuotas o un servicio puntual por etapa.'],
      ['tiempo', 'No tengo tiempo para reunirme', 'Proponer sesiones breves en horario nocturno y revisión asíncrona.'],
      ['modalidad', 'Prefiero asesoría presencial', 'Explicar el formato virtual con sesiones en vivo y grabadas.'],
      ['alcance', 'Necesito solo una parte de la tesis', 'Ajustar la propuesta a los capítulos que requiere.'],
      ['condiciones', 'No me quedan claras las condiciones de pago', 'Detallar cronograma, fechas y regla de activación.'],
      ['confianza', 'No conozco resultados de otros estudiantes', 'Compartir testimonios autorizados y la política de autoría.'],
      ['otra', 'Debo consultarlo con mi familia', 'Programar un seguimiento y enviar el resumen de la propuesta.'],
    ]) {
      const [found] = await m.query('SELECT id_objecion FROM objecion WHERE descripcion=$1', [descripcion]);
      objections[tipo] = found?.id_objecion ?? (await insert('objecion', { tipo, descripcion, respuesta_sugerida: respuesta, activa: true })).id_objecion;
      if (!found) result.objeciones++;
    }

    // --- Datos ligados a los leads de la carga inicial ---
    const leads = await m.query(`SELECT l.id_lead,l.correo,l.fecha_registro,l.id_sesion_origen,
        (SELECT c.id_conversacion FROM conversacion c WHERE c.id_lead=l.id_lead ORDER BY c.id_conversacion LIMIT 1) id_conversacion,
        (SELECT p.id_propuesta FROM propuesta p WHERE p.id_lead=l.id_lead ORDER BY p.id_propuesta LIMIT 1) id_propuesta
      FROM lead l WHERE l.correo=ANY($1::text[]) ORDER BY array_position($1::text[], l.correo::text)`, [seedEmails]);
    const firstMessage = async conv => (await m.query("SELECT id_mensaje FROM mensaje WHERE id_conversacion=$1 AND remitente='lead' ORDER BY id_mensaje LIMIT 1", [conv]))[0]?.id_mensaje ?? null;
    const objectionPlan = [[13, 'precio', true], [14, 'alcance', false], [11, 'tiempo', false], [12, 'condiciones', true], [16, 'confianza', false], [17, 'otra', false], [3, 'precio', true], [15, 'modalidad', true]];
    for (const [i, tipo, resolved] of objectionPlan) {
      const l = leads[i];
      await insert('lead_objecion', { id_lead: l.id_lead, id_propuesta: l.id_propuesta, id_objecion: objections[tipo], id_mensaje: await firstMessage(l.id_conversacion),
        detalle: 'Objeción registrada durante la conversación comercial.', resuelta: resolved, registrada_en: at(-12 + i % 6), resuelta_en: resolved ? at(-8 + i % 4) : null });
      result.objecionesLead++;
    }
    for (const [n, i] of [2, 6, 10, 14, 18, 22].entries()) {
      const l = leads[i];
      const estado = ['resuelta', 'resuelta', 'en_atencion', 'en_atencion', 'pendiente', 'pendiente'][n];
      const fields = { id_usuario_asignado: estado === 'pendiente' ? null : (sales?.id_usuario ?? user), estado,
        atendida_en: estado === 'resuelta' ? at(-14 + n * 2) : null, resolucion: estado === 'resuelta' ? 'Se resolvieron dudas y se agendó una reunión.' : null };
      // La calificación de la carga inicial ya deriva estas conversaciones: solo se avanza su atención.
      const [open] = await m.query('SELECT id_derivacion FROM derivacion_humana WHERE id_conversacion=$1 ORDER BY id_derivacion LIMIT 1', [l.id_conversacion]);
      if (open) await m.query('UPDATE derivacion_humana SET id_usuario_asignado=$2,estado=$3,atendida_en=$4,resolucion=$5 WHERE id_derivacion=$1',
        [open.id_derivacion, fields.id_usuario_asignado, fields.estado, fields.atendida_en, fields.resolucion]);
      else await insert('derivacion_humana', { id_conversacion: l.id_conversacion, id_lead: l.id_lead, motivo: 'El estudiante solicitó hablar con un asesor.',
        derivada_en: at(-15 + n * 2), evidencia: JSON.stringify({ senal: 'solicita_asesor', idMensaje: await firstMessage(l.id_conversacion) }), ...fields });
      await m.query("UPDATE conversacion SET estado=$2 WHERE id_conversacion=$1", [l.id_conversacion, estado === 'resuelta' ? 'cerrada' : 'derivada']);
      result.derivaciones++;
    }
    for (const [i, l] of leads.entries()) {
      for (const finalidad of ['contacto_comercial', 'envio_recursos'].slice(0, i % 3 === 0 ? 1 : 2)) {
        await insert('consentimiento_datos', { id_lead: l.id_lead, finalidad, aceptado: !(finalidad === 'envio_recursos' && i % 7 === 0),
          version_politica: '2026-01', fecha: l.fecha_registro, ip: `190.42.${10 + i}.${20 + i}`, medio: 'formulario_web' });
        result.consentimientos++;
      }
      const [request] = await m.query('SELECT id_recurso FROM solicitud_recurso WHERE id_sesion=$1', [l.id_sesion_origen]);
      if (request) {
        await insert('descarga_recurso', { id_recurso: request.id_recurso, id_lead: l.id_lead, id_sesion: l.id_sesion_origen, fecha: l.fecha_registro,
          canal_entrega: i % 3 === 0 ? 'correo' : 'whatsapp', entregado: i % 5 !== 4 });
        result.descargas++;
      }
    }

    // --- Referidos ---
    const referrals = new ReferralsService(scoped);
    const clients = await m.query('SELECT c.id_cliente FROM cliente c JOIN lead l ON l.id_lead=c.id_lead WHERE l.correo=ANY($1::text[]) AND c.activo ORDER BY c.id_cliente', [seedEmails]);
    const links = [];
    for (const c of clients) { links.push(await referrals.enable(c.id_cliente)); result.enlacesReferido++; }
    if (links.length) {
      const buyers = await m.query('SELECT b.id_buyer FROM buyer b WHERE b.correo=ANY($1::text[]) AND NOT EXISTS(SELECT 1 FROM atribucion_referido a WHERE a.id_buyer=b.id_buyer) ORDER BY b.id_buyer LIMIT 4', [seedEmails]);
      for (const [i, b] of buyers.entries()) {
        await insert('atribucion_referido', { id_referido: links[i % links.length].idReferido, id_buyer: b.id_buyer, fecha_captacion: at(-6 + i) });
        result.atribuciones++;
      }
      for (const [i, l] of leads.slice(18, 21).entries()) {
        await insert('atribucion_referido', { id_referido: links[i % links.length].idReferido, id_lead: l.id_lead, fecha_captacion: at(-10 + i) });
        result.atribuciones++;
      }
      for (const link of links.slice(0, 2)) {
        await insert('contexto_referido', { token_hash: createHash('sha256').update(randomBytes(32)).digest('hex'), id_referido: link.idReferido, expira_at: at(25) });
        result.contextosReferido++;
      }
    }

    // --- Orquestación de agentes y uso de conocimiento ---
    const turns = await m.query(`SELECT t.id_turno,t.id_conversacion,t.created_at,c.id_lead FROM turno_tesi t JOIN conversacion c ON c.id_conversacion=t.id_conversacion
      JOIN lead l ON l.id_lead=c.id_lead WHERE l.correo=ANY($1::text[]) ORDER BY t.id_conversacion`, [seedEmails]);
    const agentFor = i => ['negociador', 'cobranza', 'negociador', 'academico', 'marketing', 'postventa'][i % 6];
    for (const [i, t] of turns.entries()) {
      const agent = agentFor(i);
      const estado = i === 5 ? 'fallido' : 'completado';
      await insert('agente_ejecucion', { id_turno: t.id_turno, agente: estado === 'completado' ? agent : null, version: '1', estado, duracion_ms: 1400 + (i * 373) % 2600, actualizado_en: t.created_at }, 'ON CONFLICT (id_turno) DO NOTHING');
      await m.query("UPDATE turno_tesi SET motor='agentes' WHERE id_turno=$1", [t.id_turno]);
      result.ejecucionesAgente++;
      for (const operation of ['respuesta', 'calificacion'].slice(0, i % 2 ? 1 : 2)) {
        await insert('knowledge_usage', { turn_key: t.id_turno, operation, agent, release_id: active.release_id }, 'ON CONFLICT DO NOTHING');
        result.usoConocimiento++;
      }
      if (i % 3 === 1 && agent !== 'academico') {
        const estado = ['pendiente', 'en_atencion', 'resuelta'][Math.floor(i / 3) % 3];
        const content = { cobranza: 'El estudiante indica que realizó un abono y solicita verificarlo.', negociador: 'Solicita evaluar un descuento por pago al contado.',
          marketing: 'Pide información sobre talleres grupales.', postventa: 'Solicita reprogramar la próxima sesión de revisión.' }[agent];
        const s = await insert('agente_solicitud', { id_turno: t.id_turno, id_conversacion: t.id_conversacion, agente: agent, contenido: content, estado,
          id_responsable: estado === 'pendiente' ? null : (sales?.id_usuario ?? user), revision: estado === 'pendiente' ? 1 : estado === 'en_atencion' ? 2 : 3, creada_en: t.created_at });
        result.solicitudesAgente++;
        for (const accion of estado === 'pendiente' ? [] : estado === 'en_atencion' ? ['tomar'] : ['tomar', 'resolver']) {
          await insert('agente_evento', { id_conversacion: s.id_conversacion, id_usuario: sales?.id_usuario ?? user, accion });
          result.eventosAgente++;
        }
      }
    }
    result.recordatorios = (await new AttentionService(scoped).generate()).created;
    const reminders = await m.query("SELECT id_recordatorio FROM agente_recordatorio WHERE estado='pendiente' ORDER BY id_recordatorio LIMIT 2");
    for (const r of reminders) await m.query("UPDATE agente_recordatorio SET estado='revisado',id_revisor=$2 WHERE id_recordatorio=$1", [r.id_recordatorio, user]);

    await m.query('SET CONSTRAINTS ALL IMMEDIATE');
    await insert('carga_inicial', { clave: loadKey, resultado: JSON.stringify(result) });
    return { estado: 'creado', ...result };
  });
}

// Ejecuta la carga completa: CRM base, conocimiento publicado y módulos complementarios.
export async function seedAll(db) {
  const base = await seed(db);
  const knowledge = await new KnowledgeService(db).bootstrap();
  const modules = await seedModules(db);
  return { base, knowledge, modules };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await source.initialize();
    if (await source.showMigrations()) throw new Error('Ejecuta pnpm migration:run antes del seeder.');
    console.log(JSON.stringify(await seedAll(source), null, 2));
  } catch (error) {
    console.error('No se completó la carga:', error.message);
    process.exitCode = 1;
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}
