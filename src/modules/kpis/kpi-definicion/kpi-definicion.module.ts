import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KpiDefinicion } from '../../../entities/kpi-definicion.entity.js';
import { KpiDefinicionController } from './kpi-definicion.controller.js';
import { KpiDefinicionService } from './kpi-definicion.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([KpiDefinicion])],
  controllers: [KpiDefinicionController],
  providers: [KpiDefinicionService],
  exports: [KpiDefinicionService],
})
export class KpiDefinicionModule {}
