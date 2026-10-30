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
import { Objecion } from '../../../entities/objecion.entity.js';
import { ObjecionService } from './objecion.service.js';

@Controller('objecion')
export class ObjecionController {
  constructor(private readonly objecionService: ObjecionService) {}

  @Get()
  findAll(): Promise<Objecion[]> {
    return this.objecionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Objecion> {
    return this.objecionService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Objecion>): Promise<Objecion> {
    return this.objecionService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Objecion>,
  ): Promise<Objecion> {
    return this.objecionService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.objecionService.remove(id);
  }
}
