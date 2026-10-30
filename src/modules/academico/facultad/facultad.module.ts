import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Facultad } from '../../../entities/facultad.entity.js';
import { FacultadController } from './facultad.controller.js';
import { FacultadService } from './facultad.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Facultad])],
  controllers: [FacultadController],
  providers: [FacultadService],
  exports: [FacultadService],
})
export class FacultadModule {}
