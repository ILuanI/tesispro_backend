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
import { DerivacionHumana } from '../../../entities/derivacion-humana.entity.js';
import { DerivacionHumanaService } from './derivacion-humana.service.js';

@Controller('derivacion-humana')
export class DerivacionHumanaController {
  constructor(private readonly derivacionHumanaService: DerivacionHumanaService) {}

  @Get()
  findAll(): Promise<DerivacionHumana[]> {
    return this.derivacionHumanaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<DerivacionHumana> {
    return this.derivacionHumanaService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<DerivacionHumana>): Promise<DerivacionHumana> {
    return this.derivacionHumanaService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<DerivacionHumana>,
  ): Promise<DerivacionHumana> {
    return this.derivacionHumanaService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.derivacionHumanaService.remove(id);
  }
}
