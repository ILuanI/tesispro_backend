import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SesionLanding } from '../../../entities/sesion-landing.entity.js';
import { SesionLandingController } from './sesion-landing.controller.js';
import { SesionLandingService } from './sesion-landing.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([SesionLanding])],
  controllers: [SesionLandingController],
  providers: [SesionLandingService],
  exports: [SesionLandingService],
})
export class SesionLandingModule {}
