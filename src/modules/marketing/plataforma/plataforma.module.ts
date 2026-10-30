import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plataforma } from '../../../entities/plataforma.entity.js';
import { PlataformaController } from './plataforma.controller.js';
import { PlataformaService } from './plataforma.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Plataforma])],
  controllers: [PlataformaController],
  providers: [PlataformaService],
  exports: [PlataformaService],
})
export class PlataformaModule {}
