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
import { LeadObjecion } from '../../../entities/lead-objecion.entity.js';
import { LeadObjecionService } from './lead-objecion.service.js';

@Controller('lead-objecion')
export class LeadObjecionController {
  constructor(private readonly leadObjecionService: LeadObjecionService) {}

  @Get()
  findAll(): Promise<LeadObjecion[]> {
    return this.leadObjecionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<LeadObjecion> {
    return this.leadObjecionService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<LeadObjecion>): Promise<LeadObjecion> {
    return this.leadObjecionService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<LeadObjecion>,
  ): Promise<LeadObjecion> {
    return this.leadObjecionService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.leadObjecionService.remove(id);
  }
}
