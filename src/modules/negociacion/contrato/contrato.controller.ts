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
import { Contrato } from '../../../entities/contrato.entity.js';
import { ContratoService } from './contrato.service.js';

@Controller('contrato')
export class ContratoController {
  constructor(private readonly contratoService: ContratoService) {}

  @Get()
  findAll(): Promise<Contrato[]> {
    return this.contratoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Contrato> {
    return this.contratoService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Contrato>): Promise<Contrato> {
    return this.contratoService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Contrato>,
  ): Promise<Contrato> {
    return this.contratoService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.contratoService.remove(id);
  }
}
