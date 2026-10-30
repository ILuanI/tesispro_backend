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
import { PerfilLaboral } from '../../../entities/perfil-laboral.entity.js';
import { PerfilLaboralService } from './perfil-laboral.service.js';

@Controller('perfil-laboral')
export class PerfilLaboralController {
  constructor(private readonly perfilLaboralService: PerfilLaboralService) {}

  @Get()
  findAll(): Promise<PerfilLaboral[]> {
    return this.perfilLaboralService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<PerfilLaboral> {
    return this.perfilLaboralService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<PerfilLaboral>): Promise<PerfilLaboral> {
    return this.perfilLaboralService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<PerfilLaboral>,
  ): Promise<PerfilLaboral> {
    return this.perfilLaboralService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.perfilLaboralService.remove(id);
  }
}
