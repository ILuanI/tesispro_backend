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
import { ConsentimientoDatos } from '../../../entities/consentimiento-datos.entity.js';
import { ConsentimientoDatosService } from './consentimiento-datos.service.js';

@Controller('consentimiento-datos')
export class ConsentimientoDatosController {
  constructor(private readonly consentimientoDatosService: ConsentimientoDatosService) {}

  @Get()
  findAll(): Promise<ConsentimientoDatos[]> {
    return this.consentimientoDatosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ConsentimientoDatos> {
    return this.consentimientoDatosService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<ConsentimientoDatos>): Promise<ConsentimientoDatos> {
    return this.consentimientoDatosService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<ConsentimientoDatos>,
  ): Promise<ConsentimientoDatos> {
    return this.consentimientoDatosService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.consentimientoDatosService.remove(id);
  }
}
