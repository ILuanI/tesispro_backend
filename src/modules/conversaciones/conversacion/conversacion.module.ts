import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversacion } from '../../../entities/conversacion.entity.js';
import { ConversacionController } from './conversacion.controller.js';
import { ConversacionService } from './conversacion.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Conversacion])],
  controllers: [ConversacionController],
  providers: [ConversacionService],
  exports: [ConversacionService],
})
export class ConversacionModule {}
