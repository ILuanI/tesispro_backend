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
import { RecursoGratuito } from '../../../entities/recurso-gratuito.entity.js';
import { RecursoGratuitoService } from './recurso-gratuito.service.js';

@Controller('recurso-gratuito')
export class RecursoGratuitoController {
  constructor(private readonly recursoGratuitoService: RecursoGratuitoService) {}

  @Get()
  findAll(): Promise<RecursoGratuito[]> {
    return this.recursoGratuitoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<RecursoGratuito> {
    return this.recursoGratuitoService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<RecursoGratuito>): Promise<RecursoGratuito> {
    return this.recursoGratuitoService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<RecursoGratuito>,
  ): Promise<RecursoGratuito> {
    return this.recursoGratuitoService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.recursoGratuitoService.remove(id);
  }
}
