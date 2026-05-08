import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { properties } from '@telivityhaip/database';
import { DRIZZLE } from '../../database/database.module';
import { SecretCipherService } from './secret-cipher.service';

/**
 * Per-property merchant credentials for a single payment provider.
 * Stored under `properties.settings.paymentProviders.<name>`.
 *
 * Secrets live in the JSONB blob; in production this column should be
 * encrypted at rest (pgcrypto/KMS) — flagged for follow-up.
 */
export interface InstapayProviderConfig {
  enabled: boolean;
  /** Merchant identifier issued by the Instapay PSP (e.g. Paymob, NBE IPN). */
  merchantId: string;
  /** Server-side API key. NEVER expose to the booking engine frontend. */
  apiKey: string;
  /** 'sandbox' or 'live' */
  environment: 'sandbox' | 'live';
  /** Optional custom base URL — overrides the per-environment default. */
  baseUrl?: string;
  /** Optional callback URL the guest is redirected back to after consent. */
  callbackUrl?: string;
  /** Whether this provider is exposed on the public booking engine. */
  exposeOnBookingEngine?: boolean;
}

export interface StripeProviderConfig {
  enabled: boolean;
  publishableKey?: string;
  exposeOnBookingEngine?: boolean;
}

export interface IyzicoProviderConfig {
  enabled: boolean;
  apiKey: string;
  secretKey: string;
  baseCommissionRate: number;
  installments: Array<{ installments: number; commissionRate: number }>;
  environment: 'sandbox' | 'live';
  exposeOnBookingEngine?: boolean;
}

export interface PayTRProviderConfig {
  enabled: boolean;
  merchantId: string;
  merchantSalt: string;
  secretKey: string;
  baseCommissionRate: number;
  installments: Array<{ installments: number; commissionRate: number }>;
  environment: 'sandbox' | 'live';
  exposeOnBookingEngine?: boolean;
}

export interface ESTProviderConfig {
  enabled: boolean;
  apiUsername: string;
  terminalId: string;
  storeKey: string;
  apiPassword?: string;
  entId?: string;
  baseCommissionRate: number;
  installments: Array<{ installments: number; commissionRate: number }>;
  environment: 'sandbox' | 'live';
  exposeOnBookingEngine?: boolean;
}

export interface PropertyPaymentProviders {
  defaultProvider?: string;
  stripe?: StripeProviderConfig;
  instapay?: InstapayProviderConfig;
  iyzico?: IyzicoProviderConfig;
  paytr?: PayTRProviderConfig;
  isbank?: ESTProviderConfig;
  denizbank?: ESTProviderConfig;
  yapikredi?: ESTProviderConfig;
}

@Injectable()
export class PropertyPaymentSettingsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly cipher: SecretCipherService,
  ) {}

  /**
   * Internal raw read. Returns ciphertext as-is. Reserved for callers that
   * will go on to decrypt (e.g. the gateway adapter, the webhook handler).
   */
  private async loadProviders(propertyId: string): Promise<PropertyPaymentProviders> {
    const [property] = await this.db
      .select({ settings: properties.settings })
      .from(properties)
      .where(eq(properties.id, propertyId));
    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }
    const settings = (property.settings ?? {}) as Record<string, unknown>;
    return (settings['paymentProviders'] as PropertyPaymentProviders) ?? {};
  }

  /**
   * Admin-facing view: returns the same shape but redacts every secret
   * (`***` instead of ciphertext). Even admins should never need the raw
   * apiKey echoed back — they set it and it's used server-side only.
   */
  async getProviders(propertyId: string): Promise<PropertyPaymentProviders> {
    const providers = await this.loadProviders(propertyId);
    const redacted = { ...providers };

    if (redacted.instapay?.apiKey) {
      redacted.instapay = { ...redacted.instapay, apiKey: '***' };
    }
    if (redacted.iyzico?.apiKey) {
      redacted.iyzico = { ...redacted.iyzico, apiKey: '***', secretKey: '***' };
    }
    if (redacted.paytr?.secretKey) {
      redacted.paytr = { ...redacted.paytr, merchantSalt: '***', secretKey: '***' };
    }
    if (redacted.isbank?.storeKey) {
      redacted.isbank = { ...redacted.isbank, storeKey: '***', apiPassword: redacted.isbank.apiPassword ? '***' : undefined };
    }
    if (redacted.denizbank?.storeKey) {
      redacted.denizbank = { ...redacted.denizbank, storeKey: '***', apiPassword: redacted.denizbank.apiPassword ? '***' : undefined };
    }
    if (redacted.yapikredi?.storeKey) {
      redacted.yapikredi = { ...redacted.yapikredi, storeKey: '***', apiPassword: redacted.yapikredi.apiPassword ? '***' : undefined };
    }

    return redacted;
  }

  /**
   * Returns Instapay config with the apiKey decrypted. Only call from server-
   * side code (gateway adapter, webhook controller); never serialise the
   * result to a client response.
   */
  async getInstapayConfig(propertyId: string): Promise<InstapayProviderConfig> {
    const providers = await this.loadProviders(propertyId);
    const config = providers.instapay;
    if (!config || !config.enabled) {
      throw new NotFoundException(
        `Instapay is not configured for property ${propertyId}`,
      );
    }
    if (!config.merchantId || !config.apiKey) {
      throw new NotFoundException(
        `Instapay credentials are incomplete for property ${propertyId}`,
      );
    }
    return { ...config, apiKey: this.cipher.decrypt(config.apiKey) };
  }

  async upsertInstapayConfig(
    propertyId: string,
    patch: Partial<InstapayProviderConfig>,
  ): Promise<InstapayProviderConfig> {
    return this.upsertProviderConfig(propertyId, 'instapay', patch, ['apiKey']);
  }

  /**
   * Generic provider upsert with automatic secret encryption.
   * Specify which fields are secrets to be encrypted.
   */
  async upsertProviderConfig(
    propertyId: string,
    providerName: keyof PropertyPaymentProviders,
    patch: any,
    secretFields: string[] = [],
  ): Promise<any> {
    const [property] = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId));
    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }
    const settings = (property.settings ?? {}) as Record<string, any>;
    const providers: PropertyPaymentProviders =
      (settings['paymentProviders'] as PropertyPaymentProviders) ?? {};

    const current = (providers[providerName] as any) ?? {};
    const encrypted: any = {};

    // Encrypt new secrets; preserve existing ciphertext if not provided
    for (const field of secretFields) {
      if (typeof patch[field] === 'string' && patch[field].length > 0) {
        encrypted[field] = this.cipher.isEncrypted(patch[field])
          ? patch[field]
          : this.cipher.encrypt(patch[field]);
      } else {
        encrypted[field] = current[field] ?? '';
      }
    }

    // Remove secret fields from patch, merge with encrypted versions
    const secretFieldSet = new Set(secretFields);
    const patchWithoutSecrets = Object.fromEntries(
      Object.entries(patch).filter(([k]) => !secretFieldSet.has(k)),
    );

    const merged = { ...current, ...patchWithoutSecrets, ...encrypted };
    providers[providerName] = merged;
    settings['paymentProviders'] = providers;

    await this.db
      .update(properties)
      .set({ settings, updatedAt: new Date() })
      .where(eq(properties.id, propertyId));

    // Return redacted version
    const redacted = { ...merged };
    for (const field of secretFields) {
      if (redacted[field]) redacted[field] = '***';
    }
    return redacted;
  }

  /**
   * Public (no-secret) view for the booking engine — strips API keys etc.
   * Returns only what the storefront needs to know to render payment options.
   */
  async getPublicProviders(propertyId: string) {
    const providers = await this.loadProviders(propertyId);
    const enabled: Array<{ name: string; environment?: string; publishableKey?: string; installments?: any[] }> = [];

    if (providers.stripe?.enabled && providers.stripe.exposeOnBookingEngine) {
      enabled.push({
        name: 'stripe',
        publishableKey: providers.stripe.publishableKey,
      });
    }
    if (providers.instapay?.enabled && providers.instapay.exposeOnBookingEngine) {
      enabled.push({
        name: 'instapay',
        environment: providers.instapay.environment,
      });
    }
    if (providers.iyzico?.enabled && providers.iyzico.exposeOnBookingEngine) {
      enabled.push({
        name: 'iyzico',
        environment: providers.iyzico.environment,
        installments: providers.iyzico.installments,
      });
    }
    if (providers.paytr?.enabled && providers.paytr.exposeOnBookingEngine) {
      enabled.push({
        name: 'paytr',
        environment: providers.paytr.environment,
        installments: providers.paytr.installments,
      });
    }
    if (providers.isbank?.enabled && providers.isbank.exposeOnBookingEngine) {
      enabled.push({
        name: 'isbank',
        environment: providers.isbank.environment,
        installments: providers.isbank.installments,
      });
    }
    if (providers.denizbank?.enabled && providers.denizbank.exposeOnBookingEngine) {
      enabled.push({
        name: 'denizbank',
        environment: providers.denizbank.environment,
        installments: providers.denizbank.installments,
      });
    }
    if (providers.yapikredi?.enabled && providers.yapikredi.exposeOnBookingEngine) {
      enabled.push({
        name: 'yapikredi',
        environment: providers.yapikredi.environment,
        installments: providers.yapikredi.installments,
      });
    }

    return {
      defaultProvider: providers.defaultProvider,
      providers: enabled,
    };
  }
}
