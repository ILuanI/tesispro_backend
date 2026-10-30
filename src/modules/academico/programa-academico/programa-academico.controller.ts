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
import { ProgramaAcademico } from '../../../entities/programa-academico.entity.js';
import { ProgramaAcademicoService } from './programa-academico.service.js';

@Controller('programa-academico')
export class ProgramaAcademicoController {
  constructor(private readonly programaAcademicoService: ProgramaAcademicoService) {}

  @Get()
  findAll(): Promise<ProgramaAcademico[]> {
    return this.programaAcademicoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ProgramaAcademico> {
    return this.programaAcademicoService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<ProgramaAcademico>): Promise<ProgramaAcademico> {
    return this.programaAcademicoService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<ProgramaAcademico>,
  ): Promise<ProgramaAcademico> {
    return this.programaAcademicoService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.programaAcademicoService.remove(id);
  }
}
