import { Injectable, BadRequestException } from '@nestjs/common';
import type { PaymentGateway } from './interfaces/payment-gateway.interface';

/**
 * Resolves a gateway implementation by provider name.
 *
 * Multi-provider support is required because different properties run on
 * different acquirers — Stripe globally, Instapay (Egyptian Instant Payment
 * Network) for EG-based hotels, and the mock for tests/dev. The provider
 * name flows in on the payment DTO (`gatewayProvider`) and on the property's
 * payment settings.
 */
@Injectable()
export class PaymentGatewayRegistry {
  private readonly gateways = new Map<string, PaymentGateway>();

  register(gateway: PaymentGateway): void {
    this.gateways.set(gateway.name, gateway);
  }

  has(name: string): boolean {
    return this.gateways.has(name);
  }

  get(name: string): PaymentGateway {
    const gateway = this.gateways.get(name);
    if (!gateway) {
      throw new BadRequestException(
        `Unsupported payment gateway: '${name}'. Available: ${[...this.gateways.keys()].join(', ') || '(none)'}`,
      );
    }
    return gateway;
  }

  list(): string[] {
    return [...this.gateways.keys()];
  }
}
