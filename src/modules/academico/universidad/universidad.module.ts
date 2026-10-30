import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Universidad } from '../../../entities/universidad.entity.js';
import { UniversidadController } from './universidad.controller.js';
import { UniversidadService } from './universidad.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Universidad])],
  controllers: [UniversidadController],
  providers: [UniversidadService],
  exports: [UniversidadService],
})
export class UniversidadModule {}
