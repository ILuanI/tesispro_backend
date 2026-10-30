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
import { AgenteIa } from '../../../entities/agente-ia.entity.js';
import { AgenteIaService } from './agente-ia.service.js';

@Controller('agente-ia')
export class AgenteIaController {
  constructor(private readonly agenteIaService: AgenteIaService) {}

  @Get()
  findAll(): Promise<AgenteIa[]> {
    return this.agenteIaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<AgenteIa> {
    return this.agenteIaService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<AgenteIa>): Promise<AgenteIa> {
    return this.agenteIaService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<AgenteIa>,
  ): Promise<AgenteIa> {
    return this.agenteIaService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.agenteIaService.remove(id);
  }
}
