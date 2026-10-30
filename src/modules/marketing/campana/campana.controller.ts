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
import { Campana } from '../../../entities/campana.entity.js';
import { CampanaService } from './campana.service.js';

@Controller('campana')
export class CampanaController {
  constructor(private readonly campanaService: CampanaService) {}

  @Get()
  findAll(): Promise<Campana[]> {
    return this.campanaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Campana> {
    return this.campanaService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Campana>): Promise<Campana> {
    return this.campanaService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Campana>,
  ): Promise<Campana> {
    return this.campanaService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.campanaService.remove(id);
  }
}
