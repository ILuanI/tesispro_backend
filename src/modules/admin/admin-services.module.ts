import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service.js';
import { GoogleCalendarService } from './google-calendar.service.js';
import { AiModule } from '../ai/ai.module.js';
import { PaymentVerificationService } from './payment-verification.service.js';
import { PaymentSchedulesService } from './payment-schedules.service.js';
import { ContactIdentityService } from './contact-identity.service.js';
import { CommercialProposalService } from './commercial-proposal.service.js';
import { TesiQualificationService } from './tesi-qualification.service.js';
import { LeadProfileService } from './lead-profile.service.js';
import { CaptureProfileService } from './capture-profile.service.js';
import { AuthService } from './auth.js';
import { AdminService } from './admin.service.js';
import { ContractsService } from './contracts.service.js';
import { ResourcesService } from './resources.service.js';
import { BuyersService } from './buyers.service.js';
import { JourneysService } from './journeys.service.js';
import { PackagesService } from './packages.service.js';
import { ReferralsService } from './referrals.service.js';
const services = [CalendarService, GoogleCalendarService, PaymentVerificationService,
    PaymentSchedulesService,
    CommercialProposalService,
    PackagesService,
    ReferralsService,
    AuthService,
    ContactIdentityService, LeadProfileService, CaptureProfileService, TesiQualificationService,
    AdminService,
    ContractsService,
    ResourcesService,
    BuyersService,
    JourneysService];
@Module({imports:[AiModule],providers:services,exports:services})
export class AdminServicesModule {}
