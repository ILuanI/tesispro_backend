import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DescargaRecurso } from '../../../entities/descarga-recurso.entity.js';
import { DescargaRecursoController } from './descarga-recurso.controller.js';
import { DescargaRecursoService } from './descarga-recurso.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([DescargaRecurso])],
  controllers: [DescargaRecursoController],
  providers: [DescargaRecursoService],
  exports: [DescargaRecursoService],
})
export class DescargaRecursoModule {}
