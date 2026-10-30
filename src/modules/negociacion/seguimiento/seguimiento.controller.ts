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
import { Seguimiento } from '../../../entities/seguimiento.entity.js';
import { SeguimientoService } from './seguimiento.service.js';

@Controller('seguimiento')
export class SeguimientoController {
  constructor(private readonly seguimientoService: SeguimientoService) {}

  @Get()
  findAll(): Promise<Seguimiento[]> {
    return this.seguimientoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Seguimiento> {
    return this.seguimientoService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Seguimiento>): Promise<Seguimiento> {
    return this.seguimientoService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Seguimiento>,
  ): Promise<Seguimiento> {
    return this.seguimientoService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.seguimientoService.remove(id);
  }
}
