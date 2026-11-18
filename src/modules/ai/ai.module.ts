import { Module } from '@nestjs/common';
import { AiService } from './ai.service.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
@Module({ imports: [KnowledgeModule], providers: [AiService], exports: [AiService] })
export class AiModule {}
