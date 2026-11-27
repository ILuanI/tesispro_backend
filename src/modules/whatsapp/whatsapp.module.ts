import { Module } from '@nestjs/common';
import { AdminServicesModule } from '../admin/admin-services.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { WhatsAppConfig } from './whatsapp.config.js';
import { WhatsAppCloudClient } from './whatsapp-cloud.client.js';
import { WhatsAppEventsService } from './whatsapp-events.service.js';
import { WhatsAppJobsController } from './whatsapp-jobs.controller.js';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller.js';
import { WhatsAppWorkerService } from './whatsapp-worker.service.js';

@Module({
  imports: [AgentsModule, AdminServicesModule],
  controllers: [WhatsAppWebhookController, WhatsAppJobsController],
  providers: [WhatsAppConfig, WhatsAppCloudClient, WhatsAppEventsService, WhatsAppWorkerService],
})
export class WhatsAppModule {}
