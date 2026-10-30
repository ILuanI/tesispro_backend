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
import { Universidad } from '../../../entities/universidad.entity.js';
import { UniversidadService } from './universidad.service.js';

@Controller('universidad')
export class UniversidadController {
  constructor(private readonly universidadService: UniversidadService) {}

  @Get()
  findAll(): Promise<Universidad[]> {
    return this.universidadService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Universidad> {
    return this.universidadService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Universidad>): Promise<Universidad> {
    return this.universidadService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Universidad>,
  ): Promise<Universidad> {
    return this.universidadService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.universidadService.remove(id);
  }
}
