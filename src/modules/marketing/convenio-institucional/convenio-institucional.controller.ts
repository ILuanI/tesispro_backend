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
import { ConvenioInstitucional } from '../../../entities/convenio-institucional.entity.js';
import { ConvenioInstitucionalService } from './convenio-institucional.service.js';

@Controller('convenio-institucional')
export class ConvenioInstitucionalController {
  constructor(private readonly convenioInstitucionalService: ConvenioInstitucionalService) {}

  @Get()
  findAll(): Promise<ConvenioInstitucional[]> {
    return this.convenioInstitucionalService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ConvenioInstitucional> {
    return this.convenioInstitucionalService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<ConvenioInstitucional>): Promise<ConvenioInstitucional> {
    return this.convenioInstitucionalService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<ConvenioInstitucional>,
  ): Promise<ConvenioInstitucional> {
    return this.convenioInstitucionalService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.convenioInstitucionalService.remove(id);
  }
}
