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
import { DirectivaTesis } from '../../../entities/directiva-tesis.entity.js';
import { DirectivaTesisService } from './directiva-tesis.service.js';

@Controller('directiva-tesis')
export class DirectivaTesisController {
  constructor(private readonly directivaTesisService: DirectivaTesisService) {}

  @Get()
  findAll(): Promise<DirectivaTesis[]> {
    return this.directivaTesisService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<DirectivaTesis> {
    return this.directivaTesisService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<DirectivaTesis>): Promise<DirectivaTesis> {
    return this.directivaTesisService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<DirectivaTesis>,
  ): Promise<DirectivaTesis> {
    return this.directivaTesisService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.directivaTesisService.remove(id);
  }
}
