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
import { LeadEstadoHistorial } from '../../../entities/lead-estado-historial.entity.js';
import { LeadEstadoHistorialService } from './lead-estado-historial.service.js';

@Controller('lead-estado-historial')
export class LeadEstadoHistorialController {
  constructor(private readonly leadEstadoHistorialService: LeadEstadoHistorialService) {}

  @Get()
  findAll(): Promise<LeadEstadoHistorial[]> {
    return this.leadEstadoHistorialService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<LeadEstadoHistorial> {
    return this.leadEstadoHistorialService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<LeadEstadoHistorial>): Promise<LeadEstadoHistorial> {
    return this.leadEstadoHistorialService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<LeadEstadoHistorial>,
  ): Promise<LeadEstadoHistorial> {
    return this.leadEstadoHistorialService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.leadEstadoHistorialService.remove(id);
  }
}
