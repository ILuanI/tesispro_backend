import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Campana } from '../../../entities/campana.entity.js';
import { CampanaController } from './campana.controller.js';
import { CampanaService } from './campana.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Campana])],
  controllers: [CampanaController],
  providers: [CampanaService],
  exports: [CampanaService],
})
export class CampanaModule {}
