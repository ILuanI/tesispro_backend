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
import { KpiMedicion } from '../../../entities/kpi-medicion.entity.js';
import { KpiMedicionService } from './kpi-medicion.service.js';

@Controller('kpi-medicion')
export class KpiMedicionController {
  constructor(private readonly kpiMedicionService: KpiMedicionService) {}

  @Get()
  findAll(): Promise<KpiMedicion[]> {
    return this.kpiMedicionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<KpiMedicion> {
    return this.kpiMedicionService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<KpiMedicion>): Promise<KpiMedicion> {
    return this.kpiMedicionService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<KpiMedicion>,
  ): Promise<KpiMedicion> {
    return this.kpiMedicionService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.kpiMedicionService.remove(id);
  }
}
