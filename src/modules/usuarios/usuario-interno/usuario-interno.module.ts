import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsuarioInterno } from '../../../entities/usuario-interno.entity.js';
import { UsuarioInternoController } from './usuario-interno.controller.js';
import { UsuarioInternoService } from './usuario-interno.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([UsuarioInterno])],
  controllers: [UsuarioInternoController],
  providers: [UsuarioInternoService],
  exports: [UsuarioInternoService],
})
export class UsuarioInternoModule {}
