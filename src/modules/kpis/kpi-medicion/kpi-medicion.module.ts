import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KpiMedicion } from '../../../entities/kpi-medicion.entity.js';
import { KpiMedicionController } from './kpi-medicion.controller.js';
import { KpiMedicionService } from './kpi-medicion.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([KpiMedicion])],
  controllers: [KpiMedicionController],
  providers: [KpiMedicionService],
  exports: [KpiMedicionService],
})
export class KpiMedicionModule {}
