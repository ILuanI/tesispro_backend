import { ContactIdentityService } from './contact-identity.service.js';
import { TesiQualificationService } from './tesi-qualification.service.js';
import { LeadProfileService } from './lead-profile.service.js';
import { CaptureProfileService } from './capture-profile.service.js';
import { LeadProfileController, CaptureProfileController, TesiProfileController } from './lead-profile.controller.js';
import { ArgumentsHost, Catch, ExceptionFilter, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';
import { AuthController, AuthService, AdminGuard } from './auth.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { ContractsController } from './contracts.controller.js';
import { ContractsService } from './contracts.service.js';
import { ResourcesController } from './resources.controller.js';
import { ResourcesService } from './resources.service.js';
import {
  BuyersController,
  CaptureBuyersController,
} from './buyers.controller.js';
import { BuyersService } from './buyers.service.js';
import { JourneysService } from './journeys.service.js';
import { PackagesService } from './packages.service.js';
import { PackagesController, PublicPackagesController } from './packages.controller.js';
import { ReferralsService } from './referrals.service.js';
import { ReferralsController, PublicReferralsController } from './referrals.controller.js';
import {
  PublicResourcesController,
  ResourceLinksController,
  JourneysAdminController,
} from './journeys.controller.js';

@Catch(QueryFailedError)
class DatabaseErrorFilter implements ExceptionFilter {
  catch(error: QueryFailedError, host: ArgumentsHost) {
    const code = (error.driverError as { code?: string }).code;
    const status =
      code === '23505'
        ? 409
        : ['23503', '23514', '22P02'].includes(code || '')
          ? 400
          : 500;
    if (status === 500)
      console.error(
        'Error de persistencia administrativa:',
        code,
        (error.driverError as { message?: string }).message,
      );
    const message =
      status === 409
        ? 'El registro ya existe. Revisa el correo o el cronograma.'
        : status === 400
          ? 'Datos o referencias inválidas.'
          : 'No se pudo completar la operación. Revisa las migraciones y la conexión.';
    host
      .switchToHttp()
      .getResponse()
      .status(status)
      .json({ statusCode: status, message });
  }
}
@Module({
  controllers: [
    PackagesController, PublicPackagesController,
    ReferralsController,
    PublicReferralsController,
    AuthController,
    LeadProfileController, CaptureProfileController, TesiProfileController,
    AdminController,
    ContractsController,
    ResourcesController,
    BuyersController,
    CaptureBuyersController,
    PublicResourcesController,
    ResourceLinksController,
    JourneysAdminController,
  ],
  providers: [
    PackagesService,
    ReferralsService,
    AuthService,
    ContactIdentityService, LeadProfileService, CaptureProfileService, TesiQualificationService,
    AdminService,
    ContractsService,
    ResourcesService,
    BuyersService,
    JourneysService,
    { provide: APP_GUARD, useClass: AdminGuard },
    { provide: APP_FILTER, useClass: DatabaseErrorFilter },
  ],
})
export class AdminModule {}
