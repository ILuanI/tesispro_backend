import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Header, Headers,
  HttpCode, InternalServerErrorException, Logger, Post, Query, Req, type RawBodyRequest,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Public } from '../admin/auth.js';
import { sameSecret, WhatsAppConfig } from './whatsapp.config.js';
import { WhatsAppEventsService } from './whatsapp-events.service.js';
import { parseWebhook } from './whatsapp-webhook.schema.js';

export function validSignature(raw: Buffer | undefined, signature: string, secret: string) {
  if (!raw || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(
    createHmac('sha256', secret).update(raw).digest(),
    Buffer.from(signature.slice(7), 'hex'),
  );
}

@Public()
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);
  constructor(private readonly config: WhatsAppConfig, private readonly events: WhatsAppEventsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; charset=utf-8')
  challenge(@Query('hub.mode') mode: unknown, @Query('hub.verify_token') token: unknown,
    @Query('hub.challenge') challenge: unknown) {
    const { verifyToken } = this.config.get();
    if (mode !== 'subscribe' || typeof token !== 'string' || !sameSecret(token, verifyToken)) {
      throw new ForbiddenException();
    }
    if (typeof challenge !== 'string' || !challenge.length) throw new BadRequestException();
    return challenge;
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() request: RawBodyRequest<Request>, @Body() body: unknown,
    @Headers('x-hub-signature-256') signature = '') {
    const { appSecret, phone, allowed } = this.config.get();
    if (!validSignature(request.rawBody, signature, appSecret)) throw new ForbiddenException();
    const batch = parseWebhook(body, phone, allowed);
    if (!batch) {
      this.logger.warn({ event: 'whatsapp_webhook', outcome: 'invalid_envelope' });
      throw new BadRequestException();
    }
    const summary = {
      event: 'whatsapp_webhook',
      ...batch.diagnostics,
      eligible: batch.incoming.length,
      statuses: batch.statuses.length,
    };
    try {
      const persisted = await this.events.persist(phone, batch.incoming, batch.statuses);
      this.logger.log({ ...summary, ...persisted, outcome: 'committed' });
    } catch (error) {
      const code = (error as { driverError?: { code?: unknown } } | null)?.driverError?.code;
      const sqlState = typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
      this.logger.error({ ...summary, outcome: 'persistence_error', sqlState });
      throw new InternalServerErrorException();
    }
    return { accepted: true };
  }
}
