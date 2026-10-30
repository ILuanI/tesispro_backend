import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Propuesta } from '../../../entities/propuesta.entity.js';
import { PropuestaController } from './propuesta.controller.js';
import { PropuestaService } from './propuesta.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Propuesta])],
  controllers: [PropuestaController],
  providers: [PropuestaService],
  exports: [PropuestaService],
})
export class PropuestaModule {}
