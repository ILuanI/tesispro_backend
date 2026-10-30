import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DerivacionHumana } from '../../../entities/derivacion-humana.entity.js';
import { DerivacionHumanaController } from './derivacion-humana.controller.js';
import { DerivacionHumanaService } from './derivacion-humana.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([DerivacionHumana])],
  controllers: [DerivacionHumanaController],
  providers: [DerivacionHumanaService],
  exports: [DerivacionHumanaService],
})
export class DerivacionHumanaModule {}
