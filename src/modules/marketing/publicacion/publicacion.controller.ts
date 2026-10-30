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
import { Publicacion } from '../../../entities/publicacion.entity.js';
import { PublicacionService } from './publicacion.service.js';

@Controller('publicacion')
export class PublicacionController {
  constructor(private readonly publicacionService: PublicacionService) {}

  @Get()
  findAll(): Promise<Publicacion[]> {
    return this.publicacionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Publicacion> {
    return this.publicacionService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Publicacion>): Promise<Publicacion> {
    return this.publicacionService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Publicacion>,
  ): Promise<Publicacion> {
    return this.publicacionService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.publicacionService.remove(id);
  }
}
