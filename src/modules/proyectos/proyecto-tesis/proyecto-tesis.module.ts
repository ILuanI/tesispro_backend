import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProyectoTesis } from '../../../entities/proyecto-tesis.entity.js';
import { ProyectoTesisController } from './proyecto-tesis.controller.js';
import { ProyectoTesisService } from './proyecto-tesis.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProyectoTesis])],
  controllers: [ProyectoTesisController],
  providers: [ProyectoTesisService],
  exports: [ProyectoTesisService],
})
export class ProyectoTesisModule {}
