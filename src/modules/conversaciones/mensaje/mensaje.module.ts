import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mensaje } from '../../../entities/mensaje.entity.js';
import { MensajeController } from './mensaje.controller.js';
import { MensajeService } from './mensaje.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Mensaje])],
  controllers: [MensajeController],
  providers: [MensajeService],
  exports: [MensajeService],
})
export class MensajeModule {}
