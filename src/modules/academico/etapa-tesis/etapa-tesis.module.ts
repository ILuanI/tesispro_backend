import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EtapaTesis } from '../../../entities/etapa-tesis.entity.js';
import { EtapaTesisController } from './etapa-tesis.controller.js';
import { EtapaTesisService } from './etapa-tesis.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([EtapaTesis])],
  controllers: [EtapaTesisController],
  providers: [EtapaTesisService],
  exports: [EtapaTesisService],
})
export class EtapaTesisModule {}
