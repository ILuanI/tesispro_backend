import 'reflect-metadata';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

export const demoMarker = '[DEMO TESISPRO]';
export const demoEmails = Array.from(
  { length: 32 },
  (_, i) => `demo.visualizacion.${String(i + 1).padStart(2, '0')}@example.test`,
);
const decimal = (cents) =>
  `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;

// Solo añade esta muestra identificable. Nunca reemplaza ni borra registros existentes.
export async function seedDemo(db) {
  return db.transaction(async (m) => {
    await m.query(
      "SELECT pg_advisory_xact_lock(hashtext('tesispro-demo-visualizacion-v1'))",
    );
    const [{ n }] = await m.query(
      'SELECT count(*)::int n FROM lead WHERE correo=ANY($1::text[])',
      [demoEmails],
    );
    if (n === demoEmails.length) return { status: 'already_exists', leads: n };
    if (n !== 0)
      throw new Error(
        'La muestra está incompleta. No se modificó ningún registro; revisa sus correos demo antes de repetir.',
      );
    const [admin] = await m.query(
      "SELECT id_usuario FROM usuario_interno WHERE activo=true AND rol='administrador' ORDER BY id_usuario LIMIT 1",
    );
    if (!admin) throw new Error('Primero configura un administrador activo.');
    const states = Object.fromEntries(
      (await m.query('SELECT codigo,id_estado FROM estado_lead')).map((s) => [
        s.codigo,
        s.id_estado,
      ]),
    );
    if (
      [
        'nuevo',
        'calificado',
        'en_negociacion',
        'propuesta_enviada',
        'perdido',
        'payer',
      ].some((code) => !states[code])
    )
      throw new Error(
        'Ejecuta las migraciones administrativas antes de cargar la muestra.',
      );
    const services = await m.query(
      "SELECT id_servicio,codigo FROM servicio WHERE activo=true AND codigo IN ('puntual','etapas','integral') ORDER BY codigo",
    );
    if (services.length !== 3)
      throw new Error(
        'Faltan los tres servicios iniciales activos. Ejecuta las migraciones o revisa el catálogo.',
      );
    const anchor = new Date();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(anchor);
    const day = (offset) => {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const at = (offset) =>
      offset === 0 ? anchor.toISOString() : `${day(offset)}T10:00:00-05:00`;
    await m.query(
      "SELECT set_config('app.admin_usuario',$1,true),set_config('app.admin_motivo',$2,true)",
      [String(admin.id_usuario), `${demoMarker} Carga de visualización`],
    );
    const stages = [];
    for (const [index, title] of [
      'Proyecto',
      'Desarrollo',
      'Observaciones',
    ].entries()) {
      const name = `[DEMO] ${title}`;
      const [existing] = await m.query(
        'SELECT id_etapa FROM etapa_tesis WHERE nombre=$1 ORDER BY id_etapa LIMIT 1',
        [name],
      );
      const [created] = existing
        ? [existing]
        : await m.query(
            'INSERT INTO etapa_tesis(nombre,orden,descripcion) VALUES($1,$2,$3) RETURNING id_etapa',
            [name, index + 1, demoMarker],
          );
      stages.push(created.id_etapa);
    }
    const names = [
      'Valeria',
      'Diego',
      'Camila',
      'Mateo',
      'Luciana',
      'Sebastián',
      'Andrea',
      'Gabriel',
      'Sofía',
      'Nicolás',
      'Mariana',
      'Alejandro',
      'Daniela',
      'Joaquín',
      'Renata',
      'Rodrigo',
      'Paula',
      'Leonardo',
      'Isabella',
      'Adrián',
      'Fernanda',
      'Samuel',
      'Antonia',
      'Bruno',
      'Carolina',
      'Emiliano',
      'Gabriela',
      'Tomás',
      'Natalia',
      'David',
      'Claudia',
      'Andrés',
    ];
    const surnames = [
      'Torres',
      'Vargas',
      'Rojas',
      'Mendoza',
      'Salazar',
      'Castro',
      'Medina',
      'Paredes',
    ];
    const channels = [
      'whatsapp',
      'correo',
      'instagram',
      'facebook',
      'web_chat',
      'llamada',
    ];
    const universities = [
      'Universidad Demo Norte',
      'Universidad Demo Central',
      'Universidad Demo Sur',
      'Instituto Demo',
    ];
    const methods = [
      'yape',
      'plin',
      'transferencia',
      'deposito',
      'tarjeta',
      'efectivo',
    ];
    const result = {
      status: 'created',
      marker: demoMarker,
      date: today,
      leads: 0,
      propuestas: 0,
      contratos: 0,
      cronogramas: 0,
      cuotas: 0,
      pagos: 0,
    };
    for (let i = 0; i < names.length; i++) {
      const age = i < 4 ? 0 : 2 + Math.floor(((i - 4) * 24) / 28);
      const contracted = i >= 8 && i < 28;
      const state =
        i < 4
          ? 'nuevo'
          : i < 8
            ? 'propuesta_enviada'
            : i >= 28
              ? 'perdido'
              : i % 2
                ? 'en_negociacion'
                : 'calificado';
      const [lead] = await m.query(
        `INSERT INTO lead(nombres,apellidos,correo,telefono,id_estado,id_responsable,departamento,
        canal_preferido,modalidad_preferida,cumple_perfil_objetivo,nivel_interes,fecha_registro,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING id_lead`,
        [
          `${names[i]} [DEMO]`,
          surnames[i % surnames.length],
          demoEmails[i],
          `000${String(i + 1).padStart(6, '0')}`,
          states[state],
          i % 5 ? admin.id_usuario : null,
          ['Lima', 'Arequipa', 'La Libertad', 'Piura'][i % 4],
          channels[i % channels.length],
          ['virtual', 'hibrida', 'presencial'][i % 3],
          i % 4 !== 0,
          (i % 5) + 1,
          at(-age),
        ],
      );
      result.leads++;
      // El trigger crea el historial; su fecha se alinea con la fecha ficticia del lead.
      await m.query(
        'UPDATE lead_estado_historial SET fecha=$1 WHERE id_lead=$2',
        [at(-age), lead.id_lead],
      );
      await m.query(
        'INSERT INTO perfil_academico(id_lead,universidad_otra,ciclo) VALUES($1,$2,$3)',
        [lead.id_lead, universities[i % 4], (i % 4) + 7],
      );
      const service = services[i % services.length];
      const [project] = await m.query(
        `INSERT INTO proyecto_tesis(id_lead,tema,id_etapa,id_servicio_interes,observaciones,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING id_proyecto`,
        [
          lead.id_lead,
          `${demoMarker} Proyecto de investigación ${i + 1}`,
          stages[i % 3],
          service.id_servicio,
          demoMarker,
          at(-age),
        ],
      );
      if (i < 4) continue;
      const sentAge = age - 1,
        signAge = age - 2;
      const amount =
        service.codigo === 'puntual'
          ? 30000n
          : service.codigo === 'etapas'
            ? 160000n
            : 360000n;
      const currency = i % 7 === 0 ? 'USD' : 'PEN';
      const proposalState = contracted
        ? 'aceptada'
        : i < 8
          ? 'enviada'
          : i < 30
            ? 'rechazada'
            : i === 30
              ? 'vencida'
              : 'borrador';
      const [proposal] = await m.query(
        `INSERT INTO propuesta(id_lead,id_proyecto,id_usuario,estado,modalidad,tiempo_entrega_dias,monto_total,
        moneda,condiciones,fecha_envio,fecha_respuesta,created_at,motivo_rechazo)
        VALUES($1,$2,$3,$4,'virtual',30,$5,$6,$7,$8,$9,$10,$11) RETURNING id_propuesta`,
        [
          lead.id_lead,
          project.id_proyecto,
          admin.id_usuario,
          proposalState,
          decimal(amount),
          currency,
          `${demoMarker} Acuerdo ficticio para visualizar el panel.`,
          proposalState === 'borrador' ? null : at(-sentAge),
          contracted || proposalState === 'rechazada' ? at(-signAge) : null,
          at(-sentAge),
          proposalState === 'rechazada'
            ? `${demoMarker} No continúa en este ciclo`
            : null,
        ],
      );
      result.propuestas++;
      await m.query(
        `INSERT INTO propuesta_detalle(id_propuesta,id_servicio,id_etapa,descripcion,cantidad,precio_unitario,descuento)
        VALUES($1,$2,$3,$4,1,$5,0)`,
        [
          proposal.id_propuesta,
          service.id_servicio,
          stages[i % 3],
          `${demoMarker} ${service.codigo === 'puntual' ? 'Revisión puntual' : service.codigo === 'etapas' ? 'Asesoría por etapas' : 'Acompañamiento integral'}`,
          decimal(amount),
        ],
      );
      if (!contracted) {
        if (proposalState === 'enviada')
          await m.query(
            `INSERT INTO seguimiento(id_propuesta,id_lead,nro_intento,canal,estado,fecha_programada,fecha_envio,mensaje,resultado,generado_por_ia)
          VALUES($1,$2,1,'correo',$3,$4,$5,$6,$7,false)`,
            [
              proposal.id_propuesta,
              lead.id_lead,
              i % 2 ? 'enviado' : 'programado',
              at(i % 2 ? -(sentAge - 1) : 1),
              i % 2 ? at(-(sentAge - 1)) : null,
              `${demoMarker} Seguimiento de propuesta. No se envió ningún mensaje real.`,
              i % 2 ? 'A la espera de respuesta (simulado)' : null,
            ],
          );
        continue;
      }
      const [contract] = await m.query(
        `INSERT INTO contrato(id_propuesta,id_lead,version_clausulas,acepta_autoria_estudiante,fecha_firma)
        VALUES($1,$2,'demo-1.0',true,$3) RETURNING id_contrato`,
        [proposal.id_propuesta, lead.id_lead, at(-signAge)],
      );
      result.contratos++;
      async function payment(cents, status, installment = null) {
        const [paid] = await m.query(
          `INSERT INTO pago(id_contrato,id_lead,nro_cuota,id_cuota,monto,moneda,metodo,estado,fecha_pago,created_at,
          concepto,referencia_operacion,id_usuario_registro,clave_idempotencia)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id_pago`,
          [
            contract.id_contrato,
            lead.id_lead,
            installment?.nro_cuota ?? 1,
            installment?.id_cuota ?? null,
            decimal(cents),
            currency,
            methods[i % methods.length],
            status,
            status === 'confirmado' ? at(-(signAge - 1)) : null,
            at(-(signAge - 1)),
            `${demoMarker} Cobro ficticio`,
            `DEMO-${i + 1}-${installment?.nro_cuota ?? 'PREVIO'}`,
            admin.id_usuario,
            randomUUID(),
          ],
        );
        result.pagos++;
        // La conversión y el historial los generan los triggers reales.
        if (status === 'confirmado')
          await m.query(
            `UPDATE lead_estado_historial SET fecha=$1
          WHERE id_lead=$2 AND id_estado=$3`,
            [at(-(signAge - 1)), lead.id_lead, states.payer],
          );
        return paid.id_pago;
      }
      if (i >= 24) {
        if (i < 27)
          await payment(
            10000n,
            ['confirmado', 'pendiente', 'rechazado'][i - 24],
          );
        continue;
      }
      const [schedule] = await m.query(
        `INSERT INTO cronograma_pago(id_contrato,monto_programado,cobros_previos,moneda,id_usuario,created_at)
        VALUES($1,$2,0,$3,$4,$5) RETURNING id_cronograma`,
        [
          contract.id_contrato,
          decimal(amount),
          currency,
          admin.id_usuario,
          at(-signAge),
        ],
      );
      result.cronogramas++;
      for (let number = 1; number <= 4; number++) {
        const [installment] = await m.query(
          `INSERT INTO cuota_pago(id_cronograma,nro_cuota,monto,fecha_vencimiento)
          VALUES($1,$2,$3,$4) RETURNING id_cuota,nro_cuota`,
          [
            schedule.id_cronograma,
            number,
            decimal(amount / 4n),
            day(-signAge + 1 + (number - 1) * 7),
          ],
        );
        result.cuotas++;
        const scenario = (i - 8) % 4;
        if (scenario === 0)
          await payment(amount / 4n, 'confirmado', installment);
        if (scenario === 1 && number === 1)
          await payment(amount / 8n, 'confirmado', installment);
      }
    }
    // Fechas de alta/actualización alineadas con pagos y con el motivo visible en historiales.
    await m.query(
      'UPDATE lead SET updated_at=GREATEST(fecha_registro,COALESCE((SELECT max(fecha) FROM lead_estado_historial h WHERE h.id_lead=lead.id_lead),fecha_registro)) WHERE correo=ANY($1::text[])',
      [demoEmails],
    );
    return result;
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { default: db } = await import('../dist/database/typeorm.config.js');
  try {
    await db.initialize();
    console.log(JSON.stringify(await seedDemo(db), null, 2));
  } catch (error) {
    console.error(error.message || 'No se pudo cargar la muestra.');
    process.exitCode = 1;
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}
