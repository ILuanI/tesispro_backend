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
import { KpiDefinicion } from '../../../entities/kpi-definicion.entity.js';
import { KpiDefinicionService } from './kpi-definicion.service.js';

@Controller('kpi-definicion')
export class KpiDefinicionController {
  constructor(private readonly kpiDefinicionService: KpiDefinicionService) {}

  @Get()
  findAll(): Promise<KpiDefinicion[]> {
    return this.kpiDefinicionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<KpiDefinicion> {
    return this.kpiDefinicionService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<KpiDefinicion>): Promise<KpiDefinicion> {
    return this.kpiDefinicionService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<KpiDefinicion>,
  ): Promise<KpiDefinicion> {
    return this.kpiDefinicionService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.kpiDefinicionService.remove(id);
  }
}
