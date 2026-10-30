import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgramaAcademico } from '../../../entities/programa-academico.entity.js';
import { ProgramaAcademicoController } from './programa-academico.controller.js';
import { ProgramaAcademicoService } from './programa-academico.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProgramaAcademico])],
  controllers: [ProgramaAcademicoController],
  providers: [ProgramaAcademicoService],
  exports: [ProgramaAcademicoService],
})
export class ProgramaAcademicoModule {}
