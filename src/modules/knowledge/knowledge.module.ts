import { Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service.js';
@Module({ providers: [KnowledgeService], exports: [KnowledgeService] })
export class KnowledgeModule {}
