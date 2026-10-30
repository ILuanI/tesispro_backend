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
import { CuentaRedSocial } from '../../../entities/cuenta-red-social.entity.js';
import { CuentaRedSocialService } from './cuenta-red-social.service.js';

@Controller('cuenta-red-social')
export class CuentaRedSocialController {
  constructor(private readonly cuentaRedSocialService: CuentaRedSocialService) {}

  @Get()
  findAll(): Promise<CuentaRedSocial[]> {
    return this.cuentaRedSocialService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<CuentaRedSocial> {
    return this.cuentaRedSocialService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<CuentaRedSocial>): Promise<CuentaRedSocial> {
    return this.cuentaRedSocialService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<CuentaRedSocial>,
  ): Promise<CuentaRedSocial> {
    return this.cuentaRedSocialService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.cuentaRedSocialService.remove(id);
  }
}
