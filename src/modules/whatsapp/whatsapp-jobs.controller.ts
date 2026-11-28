import { Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { Public } from '../admin/auth.js';
import { sameSecret, WhatsAppConfig } from './whatsapp.config.js';
import { WhatsAppWorkerService } from './whatsapp-worker.service.js';

@Public()
@Controller('internal/whatsapp/jobs')
export class WhatsAppJobsController {
  constructor(private readonly config: WhatsAppConfig, private readonly worker: WhatsAppWorkerService) {}

  @Post('process')
  @HttpCode(200)
  async process(@Headers('authorization') authorization = '') {
    const { workerSecret } = this.config.get();
    if (!workerSecret || !authorization.startsWith('Bearer ') || !sameSecret(authorization.slice(7), workerSecret)) {
      throw new UnauthorizedException();
    }
    // Opcional: un cron externo puede llamar aquí para reintentar envíos pendientes.
    return this.worker.drain();
  }
}
