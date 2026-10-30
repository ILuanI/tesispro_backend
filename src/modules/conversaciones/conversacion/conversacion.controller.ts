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
import { Conversacion } from '../../../entities/conversacion.entity.js';
import { ConversacionService } from './conversacion.service.js';

@Controller('conversacion')
export class ConversacionController {
  constructor(private readonly conversacionService: ConversacionService) {}

  @Get()
  findAll(): Promise<Conversacion[]> {
    return this.conversacionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Conversacion> {
    return this.conversacionService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Conversacion>): Promise<Conversacion> {
    return this.conversacionService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Conversacion>,
  ): Promise<Conversacion> {
    return this.conversacionService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.conversacionService.remove(id);
  }
}
