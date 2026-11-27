import { Module } from '@nestjs/common';
import { AdminServicesModule } from '../admin/admin-services.module.js';
import { AiModule } from '../ai/ai.module.js';
import { AgentsService } from './agents.service.js';
import { AttentionService } from './attention.service.js';
import { AgentsController, AttentionController, AgentJobsController } from './agents.controller.js';
@Module({imports:[AdminServicesModule,AiModule],providers:[AgentsService,AttentionService],exports:[AgentsService],controllers:[AgentsController,AttentionController,AgentJobsController]})
export class AgentsModule {}
