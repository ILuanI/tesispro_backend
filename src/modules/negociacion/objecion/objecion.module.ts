import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Objecion } from '../../../entities/objecion.entity.js';
import { ObjecionController } from './objecion.controller.js';
import { ObjecionService } from './objecion.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Objecion])],
  controllers: [ObjecionController],
  providers: [ObjecionService],
  exports: [ObjecionService],
})
export class ObjecionModule {}
