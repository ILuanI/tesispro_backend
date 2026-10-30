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
import { NecesidadAcademica } from '../../../entities/necesidad-academica.entity.js';
import { NecesidadAcademicaService } from './necesidad-academica.service.js';

@Controller('necesidad-academica')
export class NecesidadAcademicaController {
  constructor(private readonly necesidadAcademicaService: NecesidadAcademicaService) {}

  @Get()
  findAll(): Promise<NecesidadAcademica[]> {
    return this.necesidadAcademicaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<NecesidadAcademica> {
    return this.necesidadAcademicaService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<NecesidadAcademica>): Promise<NecesidadAcademica> {
    return this.necesidadAcademicaService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<NecesidadAcademica>,
  ): Promise<NecesidadAcademica> {
    return this.necesidadAcademicaService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.necesidadAcademicaService.remove(id);
  }
}
