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
import { Cliente } from '../../../entities/cliente.entity.js';
import { ClienteService } from './cliente.service.js';

@Controller('cliente')
export class ClienteController {
  constructor(private readonly clienteService: ClienteService) {}

  @Get()
  findAll(): Promise<Cliente[]> {
    return this.clienteService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Cliente> {
    return this.clienteService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Cliente>): Promise<Cliente> {
    return this.clienteService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Cliente>,
  ): Promise<Cliente> {
    return this.clienteService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.clienteService.remove(id);
  }
}
