import 'reflect-metadata';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import source from '../dist/database/typeorm.config.js';
import { ContactIdentityService } from '../dist/modules/admin/contact-identity.service.js';
import { LeadProfileService } from '../dist/modules/admin/lead-profile.service.js';
import { PackagesService } from '../dist/modules/admin/packages.service.js';
import { CommercialProposalService } from '../dist/modules/admin/commercial-proposal.service.js';
import { TesiQualificationService } from '../dist/modules/admin/tesi-qualification.service.js';
import { ReferralsService } from '../dist/modules/admin/referrals.service.js';
import { JourneysService } from '../dist/modules/admin/journeys.service.js';
import { ResourcesService } from '../dist/modules/admin/resources.service.js';
import { PaymentVerificationService } from '../dist/modules/admin/payment-verification.service.js';
import { PaymentSchedulesService } from '../dist/modules/admin/payment-schedules.service.js';
import { ContractsService } from '../dist/modules/admin/contracts.service.js';
import { AdminService } from '../dist/modules/admin/admin.service.js';
import { cents, decimal, monthlySchedule } from '../dist/modules/admin/money.js';

const loadKey = 'crm-inicial-2026-v1';
const people = [
  ['Valeria', 'Torres'], ['Diego', 'Vargas'], ['Camila', 'Rojas'],
  ['Mateo', 'Mendoza'], ['Luciana', 'Salazar'], ['Sebastián', 'Castro'],
  ['Andrea', 'Medina'], ['Gabriel', 'Paredes'], ['Sofía', 'Herrera'],
  ['Nicolás', 'Flores'], ['Mariana', 'Sánchez'], ['Alejandro', 'Ramos'],
  ['Daniela', 'Gutiérrez'], ['Joaquín', 'Silva'], ['Renata', 'Morales'],
  ['Rodrigo', 'Vega'], ['Paula', 'Navarro'], ['Leonardo', 'Cruz'],
  ['Isabella', 'Ríos'], ['Adrián', 'Ponce'], ['Fernanda', 'León'],
  ['Samuel', 'Aguilar'], ['Antonia', 'Cáceres'], ['Bruno', 'Delgado'],
  ['Carolina', 'Campos'], ['Emiliano', 'Reyes'], ['Gabriela', 'Luna'],
  ['Tomás', 'Espinoza'], ['Natalia', 'Fuentes'], ['David', 'Alarcón'],
  ['Claudia', 'Benavides'], ['Andrés', 'Carrillo'],
];
const plain = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const seedEmails = people.map(([n, a]) => `${plain(n)}.${plain(a)}@correo.tesispro.net`);

// Real PDF structure, including byte offsets: resources can be downloaded and opened.
export function guidePdf(title, lines) {
  const escape = s => s.replace(/([\\()])/g, '\\$1');
  const body = ['BT /F1 17 Tf 50 785 Td', `(${escape(title)}) Tj`, '/F1 11 Tf',
    ...lines.flatMap(line => ['0 -24 Td', `(${escape(line)}) Tj`]), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

export async function seed(db) {
  return db.transaction(async m => {
    await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [loadKey]);
    await m.query(`CREATE TABLE IF NOT EXISTS carga_inicial (
      clave text PRIMARY KEY, fecha timestamptz NOT NULL DEFAULT now(), resultado jsonb NOT NULL)`);
    const [previous] = await m.query('SELECT resultado FROM carga_inicial WHERE clave=$1', [loadKey]);
    if (previous) return { estado: 'ya_cargado', ...previous.resultado };
    const [admin] = await m.query("SELECT id_usuario FROM usuario_interno WHERE activo AND rol='administrador' ORDER BY id_usuario LIMIT 1");
    if (!admin) throw new Error('Crea primero un administrador activo con pnpm admin:create.');
    const conflicts = await m.query(`SELECT correo FROM lead WHERE correo=ANY($1::text[])
      UNION SELECT correo FROM buyer WHERE correo=ANY($1::text[])`, [seedEmails]);
    if (conflicts.length) throw new Error('Hay contactos con los correos de la carga inicial. No se modificaron; revisa las coincidencias.');
    const scoped = {
      manager: m,
      query: (sql, params) => m.query(sql, params),
      transaction: (...args) => args.at(-1)(m),
    };
    const insert = async (table, fields) => {
      const cols = Object.keys(fields);
      return (await m.query(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, Object.values(fields)))[0];
    };
    const identity = new ContactIdentityService();
    const profiles = new LeadProfileService(scoped, identity);
    const packages = new PackagesService(scoped);
    const commercial = new CommercialProposalService(scoped, packages);
    const qualification = new TesiQualificationService(packages);
    const resources = new ResourcesService(scoped);
    const journeys = new JourneysService(scoped, new ReferralsService(scoped), identity);
    const payments = new PaymentVerificationService(scoped);
    const schedules = new PaymentSchedulesService(scoped, payments);
    const administration = new AdminService(scoped, profiles, schedules);
    const contracts = new ContractsService(scoped, administration, packages);
    const user = admin.id_usuario;
    let [sales] = await m.query("SELECT id_usuario FROM usuario_interno WHERE activo AND rol='asesor_comercial' ORDER BY id_usuario LIMIT 1");
    if (!sales) {
      const [occupied] = await m.query("SELECT 1 FROM usuario_interno WHERE correo='lucia.romero@tesispro.net'");
      if (occupied) throw new Error('El correo del responsable comercial ya existe con otro rol.');
      sales = await insert('usuario_interno', { nombres: 'Lucía', apellidos: 'Romero', correo: 'lucia.romero@tesispro.net', rol: 'asesor_comercial', activo: true });
    }
    const today = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const day = offset => {
      const d = new Date(today + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const at = offset => `${day(offset)}T09:00:00-05:00`;
    const result = { fecha: today, leads: 0, buyers: 0, recursos: 0, solicitudes: 0, reuniones: 0,
      conversaciones: 0, evaluaciones: 0, propuestas: 0, contratos: 0, cronogramas: 0, versionesCronograma: 0,
      cuotas: 0, pagos: 0, confirmados: 0, pendientes: 0, rechazados: 0, seguimientos: 0, paquetes: 0 };
    const services = await m.query("SELECT * FROM servicio WHERE codigo IN ('puntual','etapas','integral') AND activo ORDER BY CASE codigo WHEN 'puntual' THEN 1 WHEN 'etapas' THEN 2 ELSE 3 END");
    if (services.length !== 3) throw new Error('Se requieren los servicios activos puntual, etapas e integral.');
    const prices = ['500.00', '1500.00', '3000.00'];
    const deliverables = [
      ['Informe de revisión metodológica', 'Sesión de retroalimentación'],
      ['Matriz de consistencia', 'Revisión de instrumentos', 'Informe de avance'],
      ['Plan de investigación', 'Acompañamiento por capítulos', 'Preparación para sustentación'],
    ];
    for (const [i, service] of services.entries()) {
      const [config] = await m.query('SELECT * FROM r8_servicio_comercial WHERE id_servicio=$1', [service.id_servicio]);
      // Never reinterpret zero prices or overwrite an existing commercial authorization.
      if (!config || (!config.activo && config.id_usuario === null && cents(config.precio) === 0n)) {
        await commercial.configure(service.id_servicio, { revision: config?.revision, precio: prices[i], moneda: 'PEN', activo: true,
          plazoDias: [7, 30, 90][i], entregables: deliverables[i], descuentoMax: 0,
          condiciones: 'Asesoría virtual. El estudiante conserva la autoría y participa en cada revisión.' }, user);
      }
    }
    for (const [i, name] of ['Inicio de investigación', 'Desarrollo de tesis'].entries()) {
      const code = ['inicio-investigacion', 'desarrollo-tesis'][i];
      const [existing] = await m.query('SELECT id_servicio FROM servicio WHERE codigo=$1', [code]);
      if (!existing) {
        await packages.save({ codigo: code, nombre: name, descripcion: 'Acompañamiento académico organizado por avances y revisiones.',
          publicoObjetivo: 'Estudiantes y egresados que preparan su investigación', componentes: [{ idServicio: services[i + 1].id_servicio, cantidad: 1 }],
          entregables: deliverables[i + 1], restricciones: ['No incluye redacción en sustitución del estudiante.'], precioFijo: prices[i + 1],
          moneda: 'PEN', modalidad: 'virtual', duracionDias: [30, 90][i], estado: 'activo' }, user);
        result.paquetes++;
      }
    }
    const stages = [];
    for (const [i, name] of ['Proyecto de tesis', 'Desarrollo de tesis', 'Levantamiento de observaciones'].entries()) {
      const [found] = await m.query('SELECT id_etapa FROM etapa_tesis WHERE nombre=$1 ORDER BY id_etapa LIMIT 1', [name]);
      stages.push(found || await insert('etapa_tesis', { nombre: name, orden: i + 1, descripcion: name }));
    }
    const needs = [];
    for (const name of ['Revisión metodológica', 'Análisis estadístico', 'Acompañamiento de tesis']) {
      const [found] = await m.query('SELECT id_necesidad FROM necesidad_academica WHERE nombre=$1 ORDER BY id_necesidad LIMIT 1', [name]);
      needs.push(found || await insert('necesidad_academica', { nombre: name }));
    }
    const modes = [];
    for (const [i, [name, tipo, count, rule]] of [
      ['Pago al contado', 'unico', 1, 'primer_abono'],
      ['Tres cuotas mensuales', 'mensual', 3, 'primera_cuota'],
      ['Avances de investigación', 'fases', 3, 'primer_abono'],
      ['Acuerdo de cuotas', 'personalizado', 3, 'primer_abono'],
    ].entries()) {
      const mode = await insert('modalidad_pago', { nombre: name, tipo, cantidad: count, activa: true,
        fases: JSON.stringify(tipo === 'fases' ? [{ nombre: 'Plan de investigación', porcentaje: 2000, dias: 0 }, { nombre: 'Desarrollo', porcentaje: 4000, dias: 30 }, { nombre: 'Revisión final', porcentaje: 4000, dias: 60 }] : []),
        condiciones: 'Los vencimientos se mantienen según las fechas del acuerdo.', regla_activacion: rule, id_usuario: user });
      modes.push(mode.id_modalidad);
      await insert('cronograma_evento', { id_modalidad: mode.id_modalidad, tipo: 'configurar_modalidad', id_usuario: user, detalle: JSON.stringify({ nombre: name, tipo, orden: i + 1 }) });
    }
    const materials = [
      ['Guía para elegir el tema de tesis', 'elaboracion_tesis', ['Define el área de interés y el problema que quieres investigar.', 'Delimita población, lugar y periodo de estudio.', 'Revisa antecedentes recientes y registra sus fuentes.', 'Verifica el acceso a datos y la viabilidad del trabajo.', 'Formula una pregunta clara y objetivos medibles.', 'Contrasta tu propuesta con el reglamento de tu universidad.']],
      ['Lista de revisión de la matriz de consistencia', 'metodologia_investigacion', ['Relaciona cada problema con su objetivo e hipótesis.', 'Identifica variables, dimensiones e indicadores.', 'Comprueba que el diseño permite responder la pregunta.', 'Define población y criterios de selección.', 'Explica cómo recogerás y analizarás los datos.', 'Revisa la coherencia entre instrumentos e indicadores.']],
      ['Orientaciones para preparar la sustentación', 'asesoria_academica', ['Presenta el problema y explica su relevancia.', 'Resume el método y justifica las decisiones tomadas.', 'Destaca los hallazgos sin repetir todas las tablas.', 'Relaciona conclusiones y objetivos de investigación.', 'Reconoce limitaciones y posibles investigaciones futuras.', 'Ensaya la exposición y prepara respuestas a observaciones.']],
      ['Plan de trabajo para desarrollar una tesis', 'material_propio', ['Divide el proyecto en actividades concretas.', 'Asigna responsables, fechas y productos verificables.', 'Reserva tiempo para retroalimentación del asesor.', 'Organiza lecturas y referencias desde el inicio.', 'Mantén un registro de cambios por cada avance.', 'Actualiza el plan ante riesgos y dificultades.']],
    ];
    const resourceIds = [];
    for (const [i, [title, categoria, lines]] of materials.entries()) {
      const buffer = guidePdf(title, lines);
      const saved = await resources.save({ titulo: title, descripcion: lines.slice(0, 2).join(' '), categoria, formato: 'pdf', activo: true, publicado: true, destacado: true },
        { originalname: `guia-${i + 1}.pdf`, buffer, size: buffer.length });
      resourceIds.push(saved.idRecurso);
      result.recursos++;
    }
    const states = Object.fromEntries((await m.query('SELECT codigo,id_estado FROM estado_lead')).map(s => [s.codigo, s.id_estado]));
    const universities = ['Universidad Nacional Mayor de San Marcos', 'Universidad Nacional de Ingeniería', 'Universidad Nacional de San Agustín de Arequipa', 'Universidad Nacional de Trujillo'];
    const topics = ['Gestión del talento y desempeño laboral', 'Educación virtual y aprendizaje autónomo', 'Calidad del servicio y satisfacción del usuario', 'Gestión de inventarios y productividad'];
    const channels = ['facebook', 'instagram', 'tiktok', 'busqueda', 'whatsapp', 'directo'];
    const classifications = [];
    const leadIds = [];
    const conversationIds = [];
    const requestTokens = [];
    for (const [i, [nombres, apellidos]] of people.entries()) {
      const telefono = `+51940${String(120000 + i).padStart(6, '0')}`;
      let lead = null;
      if (i < 24) {
        lead = await profiles.save({ nombres, apellidos, correo: seedEmails[i], telefono, idEstado: states.nuevo,
          idResponsable: i % 4 ? sales.id_usuario : user, departamento: ['Lima', 'Arequipa', 'La Libertad', 'Piura'][i % 4],
          canalPreferido: i % 3 === 0 ? 'correo' : 'whatsapp', modalidadPreferida: 'virtual', horarioPreferido: 'De 18:00 a 20:00',
          cumplePerfilObjetivo: i % 5 !== 0, nivelInteres: (i % 5) + 1,
          perfilAcademico: { universidadOtra: universities[i % 4], ciclo: 10, condicion: i % 2 ? 'bachiller' : 'egresado', anioEgreso: 2024 + i % 2 },
          perfilLaboral: { trabaja: true, ocupacion: ['Analista administrativo', 'Docente', 'Ingeniero de procesos', 'Coordinador comercial'][i % 4], horasLibresSemana: 6 + i % 8 },
          proyectos: [{ tema: topics[i % 4], idEtapa: stages[i % 3].id_etapa, idServicioInteres: services[i % 3].id_servicio,
            fechaLimite: day(30 + i * 2), observaciones: 'Requiere acompañamiento para organizar y revisar sus avances.', necesidades: [needs[i % 3].id_necesidad] }],
        }, user);
        await m.query('UPDATE lead SET fecha_registro=$2 WHERE id_lead=$1', [lead.idLead, at(-28 + i)]);
        leadIds.push(lead.idLead);
        result.leads++;
      }
      const { token } = await journeys.visit(resourceIds[i % 4], { canal: channels[i % 6], medio: i % 3 ? 'organico' : 'anuncio', campana: ['Tesis con rumbo', 'Avanza tu investigación', 'Preparación de sustentación'][i % 3] });
      await journeys.contact(token, { nombres: `${nombres} ${apellidos}`, telefono });
      await journeys.options(token);
      if (i % 5 !== 4) {
        const file = await journeys.download(token);
        if (!file.archivo_contenido?.length) throw new Error('El recurso no tiene contenido descargable.');
        await journeys.delivered(file.idSolicitud);
      }
      const [request] = await m.query('SELECT * FROM solicitud_recurso WHERE token_hash=$1', [createHash('sha256').update(token).digest('hex')]);
      await m.query('UPDATE solicitud_recurso SET created_at=$2,formulario_completado=$2 WHERE id_solicitud=$1', [request.id_solicitud, at(-28 + i % 24)]);
      await m.query('UPDATE sesion_landing SET fecha=$2,campana_origen=$3 WHERE id_sesion=$1', [request.id_sesion, at(-28 + i % 24), request.campana]);
      if (lead) await m.query('UPDATE lead SET id_sesion_origen=$2 WHERE id_lead=$1', [lead.idLead, request.id_sesion]);
      else {
        await m.query('UPDATE buyer SET apellidos=$2,nombres=$3,correo=$4,departamento=$5,universidad_otra=$6,fecha_registro=$7 WHERE id_buyer=$1', [request.id_buyer, apellidos, nombres, seedEmails[i], 'Lima', universities[i % 4], at(-8 + i % 8)]);
        result.buyers++;
      }
      result.solicitudes++;
      requestTokens.push(token);
      if (!lead) continue;
      const c = await insert('conversacion', { id_lead: lead.idLead, id_sesion: request.id_sesion, canal: 'web_chat', iniciada_en: at(-20 + Math.min(i, 19)), id_necesidad: needs[i % 3].id_necesidad });
      conversationIds.push(c.id_conversacion);
      const need = ['revisión metodológica', 'análisis estadístico', 'acompañamiento de tesis'][i % 3];
      const stage = ['proyecto', 'desarrollo', 'observaciones'][i % 3];
      const signal = i % 4 === 0 ? 'Quiero contratar el servicio.' : i % 4 === 1 ? '¿Cuál es el precio?' : i % 4 === 2 ? 'Quiero hablar con un asesor.' : 'Deseo orientación para organizarme.';
      const text = `Necesito ${need}. Estoy en ${stage}. Mi plazo es un mes. ${signal}`;
      const message = await insert('mensaje', { id_conversacion: c.id_conversacion, remitente: 'lead', contenido: text, es_consulta_servicio: true });
      const turn = randomUUID();
      await insert('turno_tesi', { id_turno: turn, id_conversacion: c.id_conversacion, id_mensaje: message.id_mensaje });
      const evidence = fragmento => [{ idMensaje: message.id_mensaje, fragmento }];
      const item = (valor, fragmento = valor, tipo = 'declarado') => ({ valor, tipo, evidencias: evidence(fragmento) });
      const interpreted = { campos: { necesidad: item(need), etapa: item(stage), urgencia: item('un mes'), servicio: item(services[i % 3].codigo, text, 'inferido') }, senales: {} };
      if (i % 4 === 0) interpreted.senales.intencion_contratar = { valor: true, evidencias: evidence(signal) };
      if (i % 4 === 1) interpreted.senales.consulta_precio = { valor: true, evidencias: evidence(signal) };
      if (i % 4 === 2) interpreted.senales.solicita_asesor = { valor: true, evidencias: evidence(signal) };
      const evaluated = await qualification.evaluate(m, c.id_conversacion, turn, lead.idLead, null, interpreted);
      classifications.push(evaluated);
      result.evaluaciones++;
      const reply = 'Podemos orientarte a partir de tus avances y las indicaciones de tu universidad. Revisaremos contigo el alcance del acompañamiento.';
      await insert('mensaje', { id_conversacion: c.id_conversacion, remitente: 'agente_ia', contenido: reply });
      await m.query('UPDATE turno_tesi SET respuesta=$2::jsonb WHERE id_turno=$1', [turn, JSON.stringify({ reply })]);
      await insert('sugerencia_perfil', { id_lead: lead.idLead, id_conversacion: c.id_conversacion, id_mensaje: message.id_mensaje, campo: 'necesidad', valor: JSON.stringify(need) });
      result.conversaciones++;
    }
    // Book available working-hour slots; never collide with an existing appointment.
    for (let i = 0; i < 6; i++) {
      let slot;
      for (let d = 1; d < 28 && !slot; d++) {
        for (const iso of journeys.slots(day(d))) {
          const [occupied] = await m.query("SELECT 1 FROM reunion WHERE fecha_inicio=$1 AND estado='confirmada'", [iso]);
          if (!occupied) { slot = iso; break; }
        }
      }
      if (!slot) throw new Error('No hay horarios disponibles para las reuniones.');
      await journeys.startMeeting(requestTokens[i]);
      await journeys.book(requestTokens[i], { nombres: people[i].join(' '), telefono: `+51940${120000 + i}`, correo: seedEmails[i], universidad: universities[i % 4], descripcion: 'Revisión del avance de tesis y organización del plan de asesoría.', fechaInicio: slot });
      result.reuniones++;
    }
    const proposalIds = [];
    for (let i = 0; i < 18; i++) {
      const idLead = leadIds[i];
      const service = services[i % 3];
      const dto = { componentes: [{ idServicio: service.id_servicio, cantidad: 1 }], descuentoPorcentaje: 0 };
      const calculated = await commercial.calculate(m, dto);
      const [profile] = await m.query('SELECT * FROM lead WHERE id_lead=$1', [idLead]);
      const [evaluation] = await m.query('SELECT * FROM calificacion_tesi WHERE id_lead=$1 ORDER BY id_calificacion DESC LIMIT 1', [idLead]);
      const content = { ...calculated, perfil: profile, calificacion: { idCalificacion: evaluation.id_calificacion, resultado: evaluation.resultado },
        texto: `Acompañamiento académico para ${people[i].join(' ')} enfocado en ${classifications[i].campos.necesidad.valor}, mediante revisión de avances y orientación metodológica.`, idsRecomendados: [service.id_servicio] };
      const p = await insert('propuesta', { id_lead: idLead, id_usuario: user, id_conversacion: conversationIds[i], monto_total: calculated.total, moneda: calculated.moneda,
        condiciones: calculated.componentes.map(x => x.condiciones).join('\n'), tiempo_entrega_dias: Math.max(...calculated.componentes.map(x => x.plazoDias || 0)) || null,
        modalidad: 'virtual', estado: 'borrador' });
      await insert('r8_propuesta', { id_propuesta: p.id_propuesta, version_actual: 1 });
      await insert('r8_propuesta_version', { id_propuesta: p.id_propuesta, version: 1, contenido: JSON.stringify(content), excepcion: false, id_autor: user });
      await insert('r8_propuesta_evento', { id_propuesta: p.id_propuesta, version: 1, tipo: 'creada_manualmente', detalle: JSON.stringify({ origen: 'administracion' }), id_usuario: user });
      for (const line of calculated.componentes) await insert('propuesta_detalle', { id_propuesta: p.id_propuesta, id_servicio: line.idServicio, descripcion: line.nombre, cantidad: line.cantidad, precio_unitario: line.precioUnitario, descuento: line.descuento });
      proposalIds.push(p.id_propuesta);
      result.propuestas++;
      if (i < 16) await commercial.action(p.id_propuesta, { version: 1, accion: 'revisar' }, user);
      if (i < 15) await commercial.action(p.id_propuesta, { version: 1, accion: 'presentar' }, user);
      if (i < 10) await commercial.action(p.id_propuesta, { version: 1, accion: 'aceptar' }, user);
      if (i === 13) await commercial.action(p.id_propuesta, { version: 1, accion: 'rechazar', motivo: 'El estudiante continuará en el siguiente periodo académico.' }, user);
      if (i === 14) await commercial.action(p.id_propuesta, { version: 1, accion: 'solicitar_cambios', motivo: 'Solicita ajustar el alcance al capítulo metodológico.' }, user);
      if (i >= 10) continue;
      const contract = await contracts.create({ idLead, idPropuestaR8: p.id_propuesta, fechaFirma: at(-10), versionClausulas: '1.0', aceptaAutoriaEstudiante: true }, user);
      result.contratos++;
      const mode = modes[i % modes.length];
      const preview = await schedules.preview(contract.idContrato, { idModalidad: mode, cantidad: 3, primerVencimiento: day(-15 + i) });
      const cuotas = preview.cuotas.map((q, j) => ({ ...q, entregables: [{ texto: calculated.componentes[0].entregables[j % calculated.componentes[0].entregables.length], origen: 'propuesta' }] }));
      const draft = await schedules.save(contract.idContrato, { revision: 0, idModalidad: mode, cuotas, motivo: 'Distribución acordada para organizar los avances de la investigación.' }, user);
      result.cronogramas++;
      result.versionesCronograma++;
      result.cuotas += cuotas.length;
      if (i === 9) continue;
      await schedules.action(contract.idContrato, draft.idVersion, { revision: draft.revision, accion: 'solicitar', motivo: 'Revisión de fechas y entregables del acuerdo.' }, user);
      if (i === 8) continue;
      await schedules.action(contract.idContrato, draft.idVersion, { revision: draft.revision + 1, accion: 'aprobar', motivo: 'Importes, fechas y regla de activación revisados.' }, user);
      const rows = await payments.installments(contract.idContrato);
      const register = async (q, amount, state) => {
        const reference = `OP-${today.replaceAll('-', '')}-${i + 1}-${result.pagos + 1}`;
        const buffer = i % 2 === 0 ? guidePdf('Registro de abono', [
          `Titular: ${people[i].join(' ')}`, `Referencia: ${reference}`,
          `Importe: ${calculated.moneda} ${decimal(amount)}`, `Cuota: ${q.nroCuota}`,
          `Fecha de operacion: ${day(-2)}`, 'Registro sujeto a conciliacion y verificacion independiente.',
        ]) : null;
        const p = await payments.register(q.idCuota, { monto: decimal(amount), moneda: calculated.moneda, metodo: ['yape', 'plin', 'transferencia'][i % 3], fechaPago: at(-2),
          concepto: `Abono de asesoría académica, cuota ${q.nroCuota}`, referenciaOperacion: reference, claveIdempotencia: randomUUID() }, sales.id_usuario,
          buffer ? { originalname: `${reference}.pdf`, buffer, size: buffer.length } : undefined);
        result.pagos++;
        if (state !== 'pendiente') await payments.decide(p.idPago, { estado: state, motivo: state === 'confirmado' ? 'Importe y referencia cotejados en conciliación.' : 'Referencia de operación inconsistente; se requiere un nuevo registro.', claveIdempotencia: randomUUID() }, user);
        result[state === 'confirmado' ? 'confirmados' : state === 'rechazado' ? 'rechazados' : 'pendientes']++;
      };
      if (i === 0) {
        await register(rows[0], cents(rows[0].monto), 'confirmado');
      } else if (i === 1) {
        await register(rows[0], cents(rows[0].monto) * 2n / 5n, 'confirmado');
        await register(rows[0], cents(rows[0].monto) * 3n / 5n, 'pendiente');
      } else if (i === 2) {
        await register(rows[0], cents(rows[0].monto), 'confirmado');
        await register(rows[1], cents(rows[1].monto) / 2n, 'confirmado');
      } else if (i === 3) {
        await register(rows[0], cents(rows[0].monto) / 2n, 'pendiente');
        await register(rows[0], cents(rows[0].monto) / 3n, 'rechazado');
      } else if (i === 4) {
        await register(rows[0], cents(rows[0].monto) / 2n, 'confirmado');
      } else if (i === 5) {
        for (const q of rows) await register(q, cents(q.monto), 'confirmado');
      } else if (i === 6) {
        await register(rows[0], cents(rows[0].monto) / 2n, 'confirmado');
        // Renegotiate only the outstanding amount, keeping original payments intact.
        const current = await schedules.detail(contract.idContrato);
        const fresh = await schedules.preview(contract.idContrato, { idModalidad: modes[1], cantidad: 3, primerVencimiento: day(7) });
        const revised = await schedules.save(contract.idContrato, { revision: current.revision, idModalidad: modes[1], cuotas: fresh.cuotas, motivo: 'Redistribución del saldo pendiente para adecuar los avances al calendario académico.' }, user);
        await schedules.action(contract.idContrato, revised.idVersion, { revision: revised.revision, accion: 'solicitar', motivo: 'Revisión de la redistribución del saldo.' }, user);
        await schedules.action(contract.idContrato, revised.idVersion, { revision: revised.revision + 1, accion: 'aprobar', motivo: 'Saldo y abonos anteriores cotejados; se aprueba la redistribución.' }, user);
        result.versionesCronograma++;
        result.cuotas += fresh.cuotas.length;
      } else if (i === 7) {
        await register(rows[0], cents(rows[0].monto), 'confirmado');
        await schedules.delivery(rows[0].idCuota, 0, 'entregado', user);
      }
    }
    for (let i = 0; i < leadIds.length; i++) {
      const [lead] = await m.query('SELECT * FROM lead WHERE id_lead=$1', [leadIds[i]]);
      const target = i < 10 ? null : i < 15 ? states.propuesta_enviada : i % 3 ? states.calificado : states.en_negociacion;
      if (target && target !== lead.id_estado) await profiles.save({ revision: lead.revision, idEstado: target, motivo: 'Actualización del estado tras la revisión del avance comercial.' }, user, lead.id_lead);
      const [latest] = await m.query('SELECT revision FROM lead WHERE id_lead=$1', [lead.id_lead]);
      await profiles.followUp(lead.id_lead, { revision: latest.revision, idPropuesta: proposalIds[i] || null, canal: 'whatsapp', estado: 'programado',
        fechaProgramada: at(i % 4 === 0 ? -2 : 1 + i % 5), mensaje: i < 10 ? 'Revisar el avance y coordinar la siguiente asesoría.' : 'Consultar disponibilidad y resolver dudas sobre el acompañamiento.' }, user);
      result.seguimientos++;
    }
    await m.query('SET CONSTRAINTS ALL IMMEDIATE');
    await insert('carga_inicial', { clave: loadKey, resultado: JSON.stringify(result) });
    return { estado: 'creado', ...result };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await source.initialize();
    if (await source.showMigrations()) throw new Error('Ejecuta pnpm migration:run antes del seeder.');
    console.log(JSON.stringify(await seed(source), null, 2));
  } catch (error) {
    console.error('No se completó la carga inicial:', error.message);
    process.exitCode = 1;
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}
