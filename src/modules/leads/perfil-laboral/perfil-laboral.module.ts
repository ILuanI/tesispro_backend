import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerfilLaboral } from '../../../entities/perfil-laboral.entity.js';
import { PerfilLaboralController } from './perfil-laboral.controller.js';
import { PerfilLaboralService } from './perfil-laboral.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([PerfilLaboral])],
  controllers: [PerfilLaboralController],
  providers: [PerfilLaboralService],
  exports: [PerfilLaboralService],
})
export class PerfilLaboralModule {}
