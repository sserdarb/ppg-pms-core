import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FolioModule } from '../folio/folio.module';
import { WebhookModule } from '../webhook/webhook.module';
import { ServiceTokenGuard } from '../admin/service-token.guard';
import { PaymentController } from './payment.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { PaymentService } from './payment.service';
import { MockGateway } from './mock-gateway';
import { StripeGateway } from './stripe-gateway';
import { InstapayGateway } from './instapay-gateway';
import { PaymentGatewayRegistry } from './payment-gateway-registry';
import { PropertyPaymentSettingsService } from './property-payment-settings.service';
import { PropertyPaymentSettingsController } from './property-payment-settings.controller';
import { SecretCipherService } from './secret-cipher.service';
import { InstapayWebhookController } from './instapay-webhook.controller';
import {
  PAYMENT_GATEWAY,
  PAYMENT_GATEWAY_REGISTRY,
} from './interfaces/payment-gateway.interface';

/**
 * Payment module with multi-provider gateway support.
 *
 * Two layers of gateway selection:
 *
 * 1. Default (legacy) gateway — `STRIPE_MODE` env decides:
 *    - 'mock' (default) → MockGateway — no HTTP calls, returns fake success.
 *    - 'test' → StripeGateway with test keys — real Stripe in test mode.
 *    - 'live' → StripeGateway with live keys — real charges.
 *    Used when the caller does not specify a gatewayProvider.
 *
 * 2. Provider registry — every concrete gateway (stripe, instapay, mock) is
 *    registered by name. PaymentService.resolveGateway() looks up the
 *    requested provider per call, falling back to the default. This is what
 *    enables per-property providers (one hotel on Stripe, another on
 *    Instapay) without redeploying the API.
 *
 * When STRIPE_MODE is 'mock', no STRIPE_SECRET_KEY is required.
 */
@Module({
  imports: [ConfigModule, FolioModule, WebhookModule],
  controllers: [
    PaymentController,
    StripeWebhookController,
    PropertyPaymentSettingsController,
    InstapayWebhookController,
  ],
  providers: [
    PaymentService,
    PropertyPaymentSettingsService,
    SecretCipherService,
    ServiceTokenGuard,
    MockGateway,
    InstapayGateway,
    {
      provide: StripeGateway,
      useFactory: (configService: ConfigService) => {
        const mode = configService.get<string>('STRIPE_MODE', 'mock');
        if (mode === 'mock') return null;
        return new StripeGateway(configService);
      },
      inject: [ConfigService],
    },
    {
      provide: PAYMENT_GATEWAY,
      useFactory: (configService: ConfigService, mock: MockGateway, stripe: StripeGateway | null) => {
        const mode = configService.get<string>('STRIPE_MODE', 'mock');
        if (mode === 'mock') return mock;
        return stripe!;
      },
      inject: [ConfigService, MockGateway, StripeGateway],
    },
    {
      provide: PaymentGatewayRegistry,
      useFactory: (
        mock: MockGateway,
        stripe: StripeGateway | null,
        instapay: InstapayGateway,
      ) => {
        const registry = new PaymentGatewayRegistry();
        registry.register(mock);
        if (stripe) registry.register(stripe);
        registry.register(instapay);
        return registry;
      },
      inject: [MockGateway, StripeGateway, InstapayGateway],
    },
    {
      provide: PAYMENT_GATEWAY_REGISTRY,
      useExisting: PaymentGatewayRegistry,
    },
  ],
  exports: [
    PaymentService,
    PaymentGatewayRegistry,
    PropertyPaymentSettingsService,
    SecretCipherService,
  ],
})
export class PaymentModule {}
