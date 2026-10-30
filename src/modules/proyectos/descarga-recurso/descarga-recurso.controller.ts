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
import { DescargaRecurso } from '../../../entities/descarga-recurso.entity.js';
import { DescargaRecursoService } from './descarga-recurso.service.js';

@Controller('descarga-recurso')
export class DescargaRecursoController {
  constructor(private readonly descargaRecursoService: DescargaRecursoService) {}

  @Get()
  findAll(): Promise<DescargaRecurso[]> {
    return this.descargaRecursoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<DescargaRecurso> {
    return this.descargaRecursoService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<DescargaRecurso>): Promise<DescargaRecurso> {
    return this.descargaRecursoService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<DescargaRecurso>,
  ): Promise<DescargaRecurso> {
    return this.descargaRecursoService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.descargaRecursoService.remove(id);
  }
}
