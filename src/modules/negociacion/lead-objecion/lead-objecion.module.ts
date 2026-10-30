import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadObjecion } from '../../../entities/lead-objecion.entity.js';
import { LeadObjecionController } from './lead-objecion.controller.js';
import { LeadObjecionService } from './lead-objecion.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([LeadObjecion])],
  controllers: [LeadObjecionController],
  providers: [LeadObjecionService],
  exports: [LeadObjecionService],
})
export class LeadObjecionModule {}
