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
import { PropuestaDetalle } from '../../../entities/propuesta-detalle.entity.js';
import { PropuestaDetalleService } from './propuesta-detalle.service.js';

@Controller('propuesta-detalle')
export class PropuestaDetalleController {
  constructor(private readonly propuestaDetalleService: PropuestaDetalleService) {}

  @Get()
  findAll(): Promise<PropuestaDetalle[]> {
    return this.propuestaDetalleService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<PropuestaDetalle> {
    return this.propuestaDetalleService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<PropuestaDetalle>): Promise<PropuestaDetalle> {
    return this.propuestaDetalleService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<PropuestaDetalle>,
  ): Promise<PropuestaDetalle> {
    return this.propuestaDetalleService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.propuestaDetalleService.remove(id);
  }
}
