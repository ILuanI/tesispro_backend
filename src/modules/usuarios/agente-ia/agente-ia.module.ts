import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgenteIa } from '../../../entities/agente-ia.entity.js';
import { AgenteIaController } from './agente-ia.controller.js';
import { AgenteIaService } from './agente-ia.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AgenteIa])],
  controllers: [AgenteIaController],
  providers: [AgenteIaService],
  exports: [AgenteIaService],
})
export class AgenteIaModule {}
