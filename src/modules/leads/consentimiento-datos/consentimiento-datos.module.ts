import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsentimientoDatos } from '../../../entities/consentimiento-datos.entity.js';
import { ConsentimientoDatosController } from './consentimiento-datos.controller.js';
import { ConsentimientoDatosService } from './consentimiento-datos.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ConsentimientoDatos])],
  controllers: [ConsentimientoDatosController],
  providers: [ConsentimientoDatosService],
  exports: [ConsentimientoDatosService],
})
export class ConsentimientoDatosModule {}
