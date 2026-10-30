import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DirectivaTesis } from '../../../entities/directiva-tesis.entity.js';
import { DirectivaTesisController } from './directiva-tesis.controller.js';
import { DirectivaTesisService } from './directiva-tesis.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([DirectivaTesis])],
  controllers: [DirectivaTesisController],
  providers: [DirectivaTesisService],
  exports: [DirectivaTesisService],
})
export class DirectivaTesisModule {}
