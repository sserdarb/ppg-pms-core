import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServiceTokenGuard } from '../admin/service-token.guard';
import { FiscalController } from './fiscal/fiscal.controller';
import { FiscalService } from './fiscal/fiscal.service';
import { FiscalProviderRegistry } from './fiscal/fiscal-provider.registry';
import { GuestRegistrationController } from './guest-registration/guest-registration.controller';
import { GuestRegistrationService } from './guest-registration/guest-registration.service';
import { GuestRegistrationProviderRegistry } from './guest-registration/registration-provider.registry';

/**
 * Country-specific legal modules: e-invoicing (fiscal) + guest reporting.
 *
 * Wired through the same ServiceTokenGuard as /admin/tenants — these are
 * back-office endpoints, not user-facing. The PPG master panel (or a
 * cron in PMS itself for guest registration) is the expected caller.
 */
@Module({
  imports: [ConfigModule],
  controllers: [FiscalController, GuestRegistrationController],
  providers: [
    ServiceTokenGuard,
    FiscalService,
    FiscalProviderRegistry,
    GuestRegistrationService,
    GuestRegistrationProviderRegistry,
  ],
  exports: [FiscalService, GuestRegistrationService],
})
export class LegalModule {}
