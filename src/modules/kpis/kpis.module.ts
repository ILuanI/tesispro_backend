import { Module } from '@nestjs/common';
import { KpiDefinicionModule } from './kpi-definicion/kpi-definicion.module.js';
import { KpiMedicionModule } from './kpi-medicion/kpi-medicion.module.js';

@Module({
  imports: [
    KpiDefinicionModule,
    KpiMedicionModule,
  ],
  exports: [
    KpiDefinicionModule,
    KpiMedicionModule,
  ],
})
export class KpisModule {}
