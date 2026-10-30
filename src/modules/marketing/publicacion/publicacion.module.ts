import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Publicacion } from '../../../entities/publicacion.entity.js';
import { PublicacionController } from './publicacion.controller.js';
import { PublicacionService } from './publicacion.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Publicacion])],
  controllers: [PublicacionController],
  providers: [PublicacionService],
  exports: [PublicacionService],
})
export class PublicacionModule {}
