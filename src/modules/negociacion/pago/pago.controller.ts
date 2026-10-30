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
import { Pago } from '../../../entities/pago.entity.js';
import { PagoService } from './pago.service.js';

@Controller('pago')
export class PagoController {
  constructor(private readonly pagoService: PagoService) {}

  @Get()
  findAll(): Promise<Pago[]> {
    return this.pagoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Pago> {
    return this.pagoService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Pago>): Promise<Pago> {
    return this.pagoService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Pago>,
  ): Promise<Pago> {
    return this.pagoService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.pagoService.remove(id);
  }
}
