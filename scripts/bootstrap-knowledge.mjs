import 'reflect-metadata';
import source from '../dist/database/typeorm.config.js';
import { KnowledgeService } from '../dist/modules/knowledge/knowledge.service.js';
try {
  await source.initialize();
  console.log(JSON.stringify(await new KnowledgeService(source).bootstrap()));
} finally { if (source.isInitialized) await source.destroy(); }
