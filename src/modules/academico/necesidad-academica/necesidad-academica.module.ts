import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NecesidadAcademica } from '../../../entities/necesidad-academica.entity.js';
import { NecesidadAcademicaController } from './necesidad-academica.controller.js';
import { NecesidadAcademicaService } from './necesidad-academica.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([NecesidadAcademica])],
  controllers: [NecesidadAcademicaController],
  providers: [NecesidadAcademicaService],
  exports: [NecesidadAcademicaService],
})
export class NecesidadAcademicaModule {}
