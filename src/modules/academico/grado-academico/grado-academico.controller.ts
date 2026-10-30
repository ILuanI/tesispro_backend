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
import { GradoAcademico } from '../../../entities/grado-academico.entity.js';
import { GradoAcademicoService } from './grado-academico.service.js';

@Controller('grado-academico')
export class GradoAcademicoController {
  constructor(private readonly gradoAcademicoService: GradoAcademicoService) {}

  @Get()
  findAll(): Promise<GradoAcademico[]> {
    return this.gradoAcademicoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<GradoAcademico> {
    return this.gradoAcademicoService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<GradoAcademico>): Promise<GradoAcademico> {
    return this.gradoAcademicoService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<GradoAcademico>,
  ): Promise<GradoAcademico> {
    return this.gradoAcademicoService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.gradoAcademicoService.remove(id);
  }
}
