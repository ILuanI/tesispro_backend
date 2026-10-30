import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnlaceReferido } from '../../../entities/enlace-referido.entity.js';
import { EnlaceReferidoController } from './enlace-referido.controller.js';
import { EnlaceReferidoService } from './enlace-referido.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([EnlaceReferido])],
  controllers: [EnlaceReferidoController],
  providers: [EnlaceReferidoService],
  exports: [EnlaceReferidoService],
})
export class EnlaceReferidoModule {}
