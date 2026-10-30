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
import { SesionLanding } from '../../../entities/sesion-landing.entity.js';
import { SesionLandingService } from './sesion-landing.service.js';

@Controller('sesion-landing')
export class SesionLandingController {
  constructor(private readonly sesionLandingService: SesionLandingService) {}

  @Get()
  findAll(): Promise<SesionLanding[]> {
    return this.sesionLandingService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<SesionLanding> {
    return this.sesionLandingService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<SesionLanding>): Promise<SesionLanding> {
    return this.sesionLandingService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<SesionLanding>,
  ): Promise<SesionLanding> {
    return this.sesionLandingService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.sesionLandingService.remove(id);
  }
}
