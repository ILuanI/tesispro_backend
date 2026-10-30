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
import { Propuesta } from '../../../entities/propuesta.entity.js';
import { PropuestaService } from './propuesta.service.js';

@Controller('propuesta')
export class PropuestaController {
  constructor(private readonly propuestaService: PropuestaService) {}

  @Get()
  findAll(): Promise<Propuesta[]> {
    return this.propuestaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Propuesta> {
    return this.propuestaService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Propuesta>): Promise<Propuesta> {
    return this.propuestaService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Propuesta>,
  ): Promise<Propuesta> {
    return this.propuestaService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.propuestaService.remove(id);
  }
}
