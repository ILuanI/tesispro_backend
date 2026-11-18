import { AdminServicesModule } from './admin-services.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { KnowledgeController, KnowledgeInternalController } from '../knowledge/knowledge.controller.js';
import { CalendarController, GoogleCalendarCallbackController } from './calendar.controller.js';
import { PaymentVerificationController } from './payment-verification.controller.js';
import { PaymentSchedulesController } from './payment-schedules.controller.js';
import { CommercialProposalController } from './commercial-proposal.controller.js';
import { LeadProfileController, CaptureProfileController, TesiProfileController, ConversationQualificationController } from './lead-profile.controller.js';
import { ArgumentsHost, Catch, ExceptionFilter, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { QueryFailedError } from 'typeorm';
import { AuthController, AdminGuard } from './auth.js';
import { AdminController } from './admin.controller.js';
import { ContractsController } from './contracts.controller.js';
import { ResourcesController } from './resources.controller.js';
import {
  BuyersController,
  CaptureBuyersController,
} from './buyers.controller.js';
import { PackagesController, PublicPackagesController } from './packages.controller.js';
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
  imports: [AdminServicesModule, KnowledgeModule],
  controllers: [
    KnowledgeController, KnowledgeInternalController,
    CalendarController, GoogleCalendarCallbackController,
    PaymentVerificationController,
    PaymentSchedulesController,
    CommercialProposalController,
    PackagesController, PublicPackagesController,
    ReferralsController,
    PublicReferralsController,
    AuthController,
    LeadProfileController, CaptureProfileController, TesiProfileController, ConversationQualificationController,
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
    { provide: APP_GUARD, useClass: AdminGuard },
    { provide: APP_FILTER, useClass: DatabaseErrorFilter },
  ],
})
export class AdminModule {}
