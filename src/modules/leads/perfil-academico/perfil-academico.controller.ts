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
import { PerfilAcademico } from '../../../entities/perfil-academico.entity.js';
import { PerfilAcademicoService } from './perfil-academico.service.js';

@Controller('perfil-academico')
export class PerfilAcademicoController {
  constructor(private readonly perfilAcademicoService: PerfilAcademicoService) {}

  @Get()
  findAll(): Promise<PerfilAcademico[]> {
    return this.perfilAcademicoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<PerfilAcademico> {
    return this.perfilAcademicoService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<PerfilAcademico>): Promise<PerfilAcademico> {
    return this.perfilAcademicoService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<PerfilAcademico>,
  ): Promise<PerfilAcademico> {
    return this.perfilAcademicoService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.perfilAcademicoService.remove(id);
  }
}
