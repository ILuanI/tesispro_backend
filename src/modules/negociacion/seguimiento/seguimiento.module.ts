import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Seguimiento } from '../../../entities/seguimiento.entity.js';
import { SeguimientoController } from './seguimiento.controller.js';
import { SeguimientoService } from './seguimiento.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Seguimiento])],
  controllers: [SeguimientoController],
  providers: [SeguimientoService],
  exports: [SeguimientoService],
})
export class SeguimientoModule {}
