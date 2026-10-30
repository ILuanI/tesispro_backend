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
import { UsuarioInterno } from '../../../entities/usuario-interno.entity.js';
import { UsuarioInternoService } from './usuario-interno.service.js';

@Controller('usuario-interno')
export class UsuarioInternoController {
  constructor(private readonly usuarioInternoService: UsuarioInternoService) {}

  @Get()
  findAll(): Promise<UsuarioInterno[]> {
    return this.usuarioInternoService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<UsuarioInterno> {
    return this.usuarioInternoService.findOne(id);
  }

  @Post()
  create(@Body() data: Partial<UsuarioInterno>): Promise<UsuarioInterno> {
    return this.usuarioInternoService.create(data);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<UsuarioInterno>,
  ): Promise<UsuarioInterno> {
    return this.usuarioInternoService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.usuarioInternoService.remove(id);
  }
}
