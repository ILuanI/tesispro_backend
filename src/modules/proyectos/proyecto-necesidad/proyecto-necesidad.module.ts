import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProyectoNecesidad } from '../../../entities/proyecto-necesidad.entity.js';
import { ProyectoNecesidadController } from './proyecto-necesidad.controller.js';
import { ProyectoNecesidadService } from './proyecto-necesidad.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProyectoNecesidad])],
  controllers: [ProyectoNecesidadController],
  providers: [ProyectoNecesidadService],
  exports: [ProyectoNecesidadService],
})
export class ProyectoNecesidadModule {}
