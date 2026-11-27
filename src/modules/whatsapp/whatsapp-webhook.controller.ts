import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Header, Headers,
  HttpCode, Post, Query, Req, type RawBodyRequest,
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
    if (!batch) throw new BadRequestException();
    await this.events.persist(phone, batch.incoming, batch.statuses);
    return { accepted: true };
  }
}
