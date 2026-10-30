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
import { ProyectoTesis } from '../../../entities/proyecto-tesis.entity.js';
import { ProyectoTesisService } from './proyecto-tesis.service.js';

@Controller('proyecto-tesis')
export class ProyectoTesisController {
  constructor(private readonly proyectoTesisService: ProyectoTesisService) {}

  @Get()
  findAll(): Promise<ProyectoTesis[]> {
    return this.proyectoTesisService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ProyectoTesis> {
    return this.proyectoTesisService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<ProyectoTesis>): Promise<ProyectoTesis> {
    return this.proyectoTesisService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<ProyectoTesis>,
  ): Promise<ProyectoTesis> {
    return this.proyectoTesisService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.proyectoTesisService.remove(id);
  }
}
