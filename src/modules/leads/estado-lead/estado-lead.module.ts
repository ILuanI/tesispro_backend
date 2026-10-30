import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EstadoLead } from '../../../entities/estado-lead.entity.js';
import { EstadoLeadController } from './estado-lead.controller.js';
import { EstadoLeadService } from './estado-lead.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([EstadoLead])],
  controllers: [EstadoLeadController],
  providers: [EstadoLeadService],
  exports: [EstadoLeadService],
})
export class EstadoLeadModule {}
