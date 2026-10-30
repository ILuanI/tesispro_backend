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
import { ProyectoNecesidad } from '../../../entities/proyecto-necesidad.entity.js';
import { ProyectoNecesidadService } from './proyecto-necesidad.service.js';

@Controller('proyecto-necesidad')
export class ProyectoNecesidadController {
  constructor(private readonly proyectoNecesidadService: ProyectoNecesidadService) {}

  @Get()
  findAll(): Promise<ProyectoNecesidad[]> {
    return this.proyectoNecesidadService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ProyectoNecesidad> {
    return this.proyectoNecesidadService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<ProyectoNecesidad>): Promise<ProyectoNecesidad> {
    return this.proyectoNecesidadService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<ProyectoNecesidad>,
  ): Promise<ProyectoNecesidad> {
    return this.proyectoNecesidadService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.proyectoNecesidadService.remove(id);
  }
}
