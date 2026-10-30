import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GradoAcademico } from '../../../entities/grado-academico.entity.js';
import { GradoAcademicoController } from './grado-academico.controller.js';
import { GradoAcademicoService } from './grado-academico.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([GradoAcademico])],
  controllers: [GradoAcademicoController],
  providers: [GradoAcademicoService],
  exports: [GradoAcademicoService],
})
export class GradoAcademicoModule {}
