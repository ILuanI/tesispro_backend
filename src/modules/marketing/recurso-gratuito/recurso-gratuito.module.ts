import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecursoGratuito } from '../../../entities/recurso-gratuito.entity.js';
import { RecursoGratuitoController } from './recurso-gratuito.controller.js';
import { RecursoGratuitoService } from './recurso-gratuito.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([RecursoGratuito])],
  controllers: [RecursoGratuitoController],
  providers: [RecursoGratuitoService],
  exports: [RecursoGratuitoService],
})
export class RecursoGratuitoModule {}
