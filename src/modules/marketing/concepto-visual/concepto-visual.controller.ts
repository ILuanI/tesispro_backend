import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ConceptoVisual } from '../../../entities/concepto-visual.entity.js';
import { ConceptoVisualService } from './concepto-visual.service.js';

@Controller('concepto-visual')
export class ConceptoVisualController {
  constructor(private readonly conceptoVisualService: ConceptoVisualService) {}

  @Get()
  findAll(): Promise<ConceptoVisual[]> {
    return this.conceptoVisualService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ConceptoVisual> {
    return this.conceptoVisualService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<ConceptoVisual>): Promise<ConceptoVisual> {
    return this.conceptoVisualService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<ConceptoVisual>,
  ): Promise<ConceptoVisual> {
    return this.conceptoVisualService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.conceptoVisualService.remove(id);
  }
}
