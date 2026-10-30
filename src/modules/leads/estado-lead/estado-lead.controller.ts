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
import { EstadoLead } from '../../../entities/estado-lead.entity.js';
import { EstadoLeadService } from './estado-lead.service.js';

@Controller('estado-lead')
export class EstadoLeadController {
  constructor(private readonly estadoLeadService: EstadoLeadService) {}

  @Get()
  findAll(): Promise<EstadoLead[]> {
    return this.estadoLeadService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<EstadoLead> {
    return this.estadoLeadService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<EstadoLead>): Promise<EstadoLead> {
    return this.estadoLeadService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<EstadoLead>,
  ): Promise<EstadoLead> {
    return this.estadoLeadService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.estadoLeadService.remove(id);
  }
}
