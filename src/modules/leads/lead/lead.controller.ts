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
import { Lead } from '../../../entities/lead.entity.js';
import { LeadService } from './lead.service.js';

@Controller('lead')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Get()
  findAll(): Promise<Lead[]> {
    return this.leadService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Lead> {
    return this.leadService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<Lead>): Promise<Lead> {
    return this.leadService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Lead>,
  ): Promise<Lead> {
    return this.leadService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.leadService.remove(id);
  }
}
