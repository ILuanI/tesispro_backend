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
import { Servicio } from '../../../entities/servicio.entity.js';
import { ServicioService } from './servicio.service.js';

@Controller('servicio')
export class ServicioController {
  constructor(private readonly servicioService: ServicioService) {}

  @Get()
  findAll(): Promise<Servicio[]> {
    return this.servicioService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Servicio> {
    return this.servicioService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Servicio>): Promise<Servicio> {
    return this.servicioService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Servicio>,
  ): Promise<Servicio> {
    return this.servicioService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.servicioService.remove(id);
  }
}
