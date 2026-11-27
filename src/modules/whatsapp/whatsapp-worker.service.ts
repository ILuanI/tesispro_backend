import { Injectable } from '@nestjs/common';
import { AgentsService } from '../agents/agents.service.js';
import { initialState } from '../ai/state.js';
import { WhatsAppCloudClient } from './whatsapp-cloud.client.js';
import { WhatsAppConfig } from './whatsapp.config.js';
import { WhatsAppEventsService } from './whatsapp-events.service.js';

@Injectable()
export class WhatsAppWorkerService {
  constructor(
    private readonly config: WhatsAppConfig,
    private readonly events: WhatsAppEventsService,
    private readonly agents: AgentsService,
    private readonly cloud: WhatsAppCloudClient,
  ) {}

  async run() {
    const config = this.config.get();
    const { phone, allowed } = config;
    const job = await this.events.claim(phone);
    if (!job) return { processed: false };
    if (job === 'recovered') return { processed: true };
    if (!allowed.includes(job.sender_id) || !await this.events.allowed(job, job.handoff)) {
      await this.events.skip(job);
      return { processed: true };
    }

    let reply = job.reply;
    let handoff = job.handoff ?? false;
    if (!reply) {
      if (job.format === 'text') {
        try {
          const turn = await this.agents.turn({
            idTurno: job.turn_id, message: job.body, history: [], state: initialState(),
          }, job.contact_token, 'whatsapp', config);
          if (!turn.result?.reply) {
            await this.events.settle(job, { kind: 'retry' });
            return { processed: true };
          }
          handoff = turn.result.readyForHandoff === true;
          reply = handoff ? 'Un asesor revisará tu solicitud.' : turn.result.reply;
        } catch {
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
