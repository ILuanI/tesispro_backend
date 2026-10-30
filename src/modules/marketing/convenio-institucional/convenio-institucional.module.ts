import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConvenioInstitucional } from '../../../entities/convenio-institucional.entity.js';
import { ConvenioInstitucionalController } from './convenio-institucional.controller.js';
import { ConvenioInstitucionalService } from './convenio-institucional.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ConvenioInstitucional])],
  controllers: [ConvenioInstitucionalController],
  providers: [ConvenioInstitucionalService],
  exports: [ConvenioInstitucionalService],
})
export class ConvenioInstitucionalModule {}
