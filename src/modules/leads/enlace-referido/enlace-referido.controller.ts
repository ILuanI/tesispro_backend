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
import { EnlaceReferido } from '../../../entities/enlace-referido.entity.js';
import { EnlaceReferidoService } from './enlace-referido.service.js';

@Controller('enlace-referido')
export class EnlaceReferidoController {
  constructor(private readonly enlaceReferidoService: EnlaceReferidoService) {}

  @Get()
  findAll(): Promise<EnlaceReferido[]> {
    return this.enlaceReferidoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<EnlaceReferido> {
    return this.enlaceReferidoService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<EnlaceReferido>): Promise<EnlaceReferido> {
    return this.enlaceReferidoService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<EnlaceReferido>,
  ): Promise<EnlaceReferido> {
    return this.enlaceReferidoService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.enlaceReferidoService.remove(id);
  }
}
