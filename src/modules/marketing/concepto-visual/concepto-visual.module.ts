import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConceptoVisual } from '../../../entities/concepto-visual.entity.js';
import { ConceptoVisualController } from './concepto-visual.controller.js';
import { ConceptoVisualService } from './concepto-visual.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ConceptoVisual])],
  controllers: [ConceptoVisualController],
  providers: [ConceptoVisualService],
  exports: [ConceptoVisualService],
})
export class ConceptoVisualModule {}
