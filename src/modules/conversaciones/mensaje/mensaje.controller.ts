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
import { Mensaje } from '../../../entities/mensaje.entity.js';
import { MensajeService } from './mensaje.service.js';

@Controller('mensaje')
export class MensajeController {
  constructor(private readonly mensajeService: MensajeService) {}

  @Get()
  findAll(): Promise<Mensaje[]> {
    return this.mensajeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Mensaje> {
    return this.mensajeService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Mensaje>): Promise<Mensaje> {
    return this.mensajeService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Mensaje>,
  ): Promise<Mensaje> {
    return this.mensajeService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.mensajeService.remove(id);
  }
}
