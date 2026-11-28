import { Injectable, Logger } from '@nestjs/common';
import { AgentsService, errorSummary } from '../agents/agents.service.js';
import { initialState } from '../ai/state.js';
import { WhatsAppCloudClient } from './whatsapp-cloud.client.js';
import { senderAllowed, WhatsAppConfig } from './whatsapp.config.js';
import { WhatsAppEventsService } from './whatsapp-events.service.js';

/** Texto que se envía por WhatsApp: la respuesta de Tesi y, si existe, la propuesta preliminar. */
export function whatsappText(result: { reply: string; proposal?: { name?: string; text?: string; condition?: string } | null }) {
  const proposal = result.proposal?.text
    ? `\n\nPropuesta preliminar: ${result.proposal.name ? `${result.proposal.name} — ` : ''}${result.proposal.text}.${result.proposal.condition ? `\n${result.proposal.condition}` : ''}`
    : '';
  return (result.reply + proposal).slice(0, 4000);
}

@Injectable()
export class WhatsAppWorkerService {
  private readonly logger = new Logger(WhatsAppWorkerService.name);
  constructor(
    private readonly config: WhatsAppConfig,
    private readonly events: WhatsAppEventsService,
    private readonly agents: AgentsService,
    private readonly cloud: WhatsAppCloudClient,
  ) {}

  /**
   * Procesa la cola hasta vaciarla o agotar el tiempo. Se lanza tras cada webhook.
   * Si un mensaje quedó programado para reintento dentro del tiempo disponible
   * (2, 4, 8, 16 s), espera y lo reintenta en la misma ejecución.
   */
  async drain(budgetMs = 50_000, maxJobs = 20) {
    const deadline = Date.now() + budgetMs;
    let processed = 0;
    while (processed < maxJobs && Date.now() < deadline) {
      const { processed: worked } = await this.run();
      if (worked) { processed++; continue; }
      const wait = await this.events.nextRetryIn(this.config.get().phone);
      if (wait === null || Date.now() + wait + 1_000 >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, wait + 100));
    }
    return { processed };
  }

  async run() {
    const config = this.config.get();
    const { phone, allowed } = config;
    const job = await this.events.claim(phone);
    if (!job) return { processed: false };
    if (job === 'recovered') return { processed: true };
    if (!senderAllowed(allowed, job.sender_id) || !await this.events.allowed(job, job.handoff)) {
      await this.events.skip(job);
      return { processed: true };
    }

    let reply = job.reply;
    let handoff = job.handoff ?? false;
    if (!reply) {
      if (job.format === 'text') {
        try {
          // El historial y el estado se leen de la conversación guardada (ver CaptureProfileService.begin).
          const turn = await this.agents.turn({
            idTurno: job.turn_id, message: job.body, history: [], state: initialState(),
          }, job.contact_token, 'whatsapp', config);
          if (!turn.result?.reply) {
            this.logger.warn({ event: 'whatsapp_turn', outcome: 'retry', reason: 'no_reply', attempt: job.attempts });
            await this.events.settle(job, { kind: 'retry' });
            return { processed: true };
          }
          // Si el turno pasó a atención humana, se envía igualmente la respuesta de Tesi con el aviso.
          handoff = turn.result.orchestration?.attention === 'human';
          reply = whatsappText(turn.result);
          if (handoff && !/asesor/i.test(reply)) reply =`${reply}\n\nUn asesor continuará la atención por este chat.`.slice(0, 4096);
        } catch (error) {
          this.logger.warn({ event: 'whatsapp_turn', outcome: 'retry', reason: 'exception', attempt: job.attempts, ...errorSummary(error) });
          await this.events.settle(job, { kind: 'retry' });
          return { processed: true };
        }
      } else {
        reply = job.format === 'too_long'
          ? 'Por favor, envía tu consulta en un texto de hasta 800 caracteres.'
          : 'Por ahora puedo recibir consultas en texto. Escribe tu pregunta sobre TesisPro.';
      }
    }
    const outbound = await this.events.prepare(job, reply!, handoff);
    if (!outbound) return { processed: true };
    if (!await this.events.startSend(job, outbound.handoff)) {
      await this.events.skip(job);
      return { processed: true };
    }
    const result = await this.cloud.send(job.sender_id, outbound.reply, outbound.correlation);
    await this.events.settle(job, result);
    return { processed: true };
  }
}
