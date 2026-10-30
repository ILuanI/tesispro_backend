import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadEstadoHistorial } from '../../../entities/lead-estado-historial.entity.js';
import { LeadEstadoHistorialController } from './lead-estado-historial.controller.js';
import { LeadEstadoHistorialService } from './lead-estado-historial.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([LeadEstadoHistorial])],
  controllers: [LeadEstadoHistorialController],
  providers: [LeadEstadoHistorialService],
  exports: [LeadEstadoHistorialService],
})
export class LeadEstadoHistorialModule {}
