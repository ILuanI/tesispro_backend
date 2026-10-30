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
import { EtapaTesis } from '../../../entities/etapa-tesis.entity.js';
import { EtapaTesisService } from './etapa-tesis.service.js';

@Controller('etapa-tesis')
export class EtapaTesisController {
  constructor(private readonly etapaTesisService: EtapaTesisService) {}

  @Get()
  findAll(): Promise<EtapaTesis[]> {
    return this.etapaTesisService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<EtapaTesis> {
    return this.etapaTesisService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<EtapaTesis>): Promise<EtapaTesis> {
    return this.etapaTesisService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<EtapaTesis>,
  ): Promise<EtapaTesis> {
    return this.etapaTesisService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.etapaTesisService.remove(id);
  }
}
