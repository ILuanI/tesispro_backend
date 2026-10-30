import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CuentaRedSocial } from '../../../entities/cuenta-red-social.entity.js';
import { CuentaRedSocialController } from './cuenta-red-social.controller.js';
import { CuentaRedSocialService } from './cuenta-red-social.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([CuentaRedSocial])],
  controllers: [CuentaRedSocialController],
  providers: [CuentaRedSocialService],
  exports: [CuentaRedSocialService],
})
export class CuentaRedSocialModule {}
