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
import { Facultad } from '../../../entities/facultad.entity.js';
import { FacultadService } from './facultad.service.js';

@Controller('facultad')
export class FacultadController {
  constructor(private readonly facultadService: FacultadService) {}

  @Get()
  findAll(): Promise<Facultad[]> {
    return this.facultadService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Facultad> {
    return this.facultadService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Facultad>): Promise<Facultad> {
    return this.facultadService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Facultad>,
  ): Promise<Facultad> {
    return this.facultadService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.facultadService.remove(id);
  }
}
