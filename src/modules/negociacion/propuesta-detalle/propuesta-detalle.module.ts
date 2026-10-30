import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PropuestaDetalle } from '../../../entities/propuesta-detalle.entity.js';
import { PropuestaDetalleController } from './propuesta-detalle.controller.js';
import { PropuestaDetalleService } from './propuesta-detalle.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([PropuestaDetalle])],
  controllers: [PropuestaDetalleController],
  providers: [PropuestaDetalleService],
  exports: [PropuestaDetalleService],
})
export class PropuestaDetalleModule {}
