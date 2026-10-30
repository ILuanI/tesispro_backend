import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerfilAcademico } from '../../../entities/perfil-academico.entity.js';
import { PerfilAcademicoController } from './perfil-academico.controller.js';
import { PerfilAcademicoService } from './perfil-academico.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([PerfilAcademico])],
  controllers: [PerfilAcademicoController],
  providers: [PerfilAcademicoService],
  exports: [PerfilAcademicoService],
})
export class PerfilAcademicoModule {}
