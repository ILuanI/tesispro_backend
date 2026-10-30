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
import { Plataforma } from '../../../entities/plataforma.entity.js';
import { PlataformaService } from './plataforma.service.js';

@Controller('plataforma')
export class PlataformaController {
  constructor(private readonly plataformaService: PlataformaService) {}

  @Get()
  findAll(): Promise<Plataforma[]> {
    return this.plataformaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Plataforma> {
    return this.plataformaService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Plataforma>): Promise<Plataforma> {
    return this.plataformaService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Plataforma>,
  ): Promise<Plataforma> {
    return this.plataformaService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.plataformaService.remove(id);
  }
}
