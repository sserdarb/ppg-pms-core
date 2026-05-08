import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import type {
  PaymentGateway,
  PaymentGatewayCallOptions,
  PaymentGatewayResult,
} from './interfaces/payment-gateway.interface';
import { PropertyPaymentSettingsService } from './property-payment-settings.service';

/**
 * Instapay (Egyptian Instant Payment Network) adapter.
 *
 * Instapay is the Central Bank of Egypt's IPN — guests pay through their bank
 * app via merchant alias / QR. Most hotels integrate via a PSP (Paymob,
 * Fawry, NBE-IPN, CIB) that fronts the IPN; this adapter speaks the common
 * REST shape those PSPs expose:
 *
 *   POST   /transactions                 → create + authorize (returns redirect)
 *   POST   /transactions/{id}/capture    → capture a held authorization
 *   POST   /transactions/{id}/void       → cancel an unhcaptured authorization
 *   POST   /transactions/{id}/refund     → refund a captured transaction
 *
 * Per-property credentials (merchantId, apiKey, environment, callbackUrl) are
 * looked up from `properties.settings.paymentProviders.instapay` at call time
 * — this is multi-tenant; each hotel has its own merchant account.
 *
 * No raw card data ever transits this adapter (PCI scope avoidance) — Instapay
 * uses bank-app authorization, not card numbers. The `token` argument from the
 * generic interface is interpreted as the guest's payer alias (mobile number,
 * national ID, or merchant-issued payerRef) supplied by the booking engine.
 */
@Injectable()
export class InstapayGateway implements PaymentGateway {
  readonly name = 'instapay';
  private readonly logger = new Logger(InstapayGateway.name);

  private static readonly DEFAULT_BASE_URLS: Record<'sandbox' | 'live', string> = {
    sandbox: 'https://sandbox.instapay-ipn.example/v1',
    live: 'https://api.instapay-ipn.example/v1',
  };

  constructor(
    private readonly propertySettings: PropertyPaymentSettingsService,
  ) {}

  private async resolveCredentials(options?: PaymentGatewayCallOptions) {
    if (!options?.propertyId) {
      throw new BadRequestException(
        'Instapay requires propertyId on the payment call to resolve merchant credentials',
      );
    }
    const config = await this.propertySettings.getInstapayConfig(options.propertyId);
    const baseUrl =
      config.baseUrl ?? InstapayGateway.DEFAULT_BASE_URLS[config.environment];
    return { config, baseUrl };
  }

  private async request<T>(
    method: 'POST' | 'GET',
    url: string,
    apiKey: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: any;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }
    if (!res.ok) {
      const message =
        parsed?.error?.message ??
        parsed?.message ??
        `Instapay HTTP ${res.status}`;
      const err = new Error(message);
      (err as any).status = res.status;
      (err as any).body = parsed;
      throw err;
    }
    return parsed as T;
  }

  async authorize(
    payerRef: string,
    amount: number,
    currency: string,
    options?: PaymentGatewayCallOptions,
  ): Promise<PaymentGatewayResult> {
    try {
      const { config, baseUrl } = await this.resolveCredentials(options);

      // Egyptian retail amounts are tracked in piastres (1 EGP = 100 piastres).
      // Currency must be EGP for IPN; reject anything else here so we don't
      // silently route a USD charge through an EGP-only acquirer.
      if (currency.toUpperCase() !== 'EGP') {
        return {
          success: false,
          transactionId: '',
          errorMessage: `Instapay only supports EGP, got ${currency}`,
        };
      }

      const body = {
        merchantId: config.merchantId,
        amount: Math.round(amount * 100),
        currency: 'EGP',
        payerRef,
        captureMode: 'manual',
        callbackUrl: config.callbackUrl,
      };

      const resp = await this.request<{
        id: string;
        status: string;
        redirectUrl?: string;
      }>('POST', `${baseUrl}/transactions`, config.apiKey, body, options?.idempotencyKey);

      this.logger.log(`Instapay transaction created: ${resp.id} (${resp.status})`);

      // PSPs return either 'authorized' (immediate) or 'pending' (consent page).
      const ok = ['authorized', 'pending', 'requires_action'].includes(resp.status);
      return {
        success: ok,
        transactionId: resp.id,
        redirectUrl: resp.redirectUrl,
        errorMessage: ok ? undefined : `Unexpected status: ${resp.status}`,
      };
    } catch (err: any) {
      this.logger.error(`Instapay authorize failed: ${err.message}`, err.stack);
      return {
        success: false,
        transactionId: '',
        errorMessage: err.message ?? 'Authorization failed',
      };
    }
  }

  async capture(
    transactionId: string,
    amount?: number,
    options?: PaymentGatewayCallOptions,
  ): Promise<PaymentGatewayResult> {
    try {
      const { config, baseUrl } = await this.resolveCredentials(options);
      const body: Record<string, unknown> = {};
      if (amount !== undefined) body['amount'] = Math.round(amount * 100);

      const resp = await this.request<{ id: string; status: string }>(
        'POST',
        `${baseUrl}/transactions/${encodeURIComponent(transactionId)}/capture`,
        config.apiKey,
        body,
        options?.idempotencyKey,
      );
      this.logger.log(`Instapay captured: ${resp.id}`);
      return { success: true, transactionId: resp.id };
    } catch (err: any) {
      this.logger.error(`Instapay capture failed: ${err.message}`, err.stack);
      return {
        success: false,
        transactionId,
        errorMessage: err.message ?? 'Capture failed',
      };
    }
  }

  async void(
    transactionId: string,
    options?: PaymentGatewayCallOptions,
  ): Promise<PaymentGatewayResult> {
    try {
      const { config, baseUrl } = await this.resolveCredentials(options);
      const resp = await this.request<{ id: string; status: string }>(
        'POST',
        `${baseUrl}/transactions/${encodeURIComponent(transactionId)}/void`,
        config.apiKey,
        {},
        options?.idempotencyKey,
      );
      this.logger.log(`Instapay voided: ${resp.id}`);
      return { success: true, transactionId: resp.id };
    } catch (err: any) {
      this.logger.error(`Instapay void failed: ${err.message}`, err.stack);
      return {
        success: false,
        transactionId,
        errorMessage: err.message ?? 'Void failed',
      };
    }
  }

  async refund(
    transactionId: string,
    amount?: number,
    options?: PaymentGatewayCallOptions,
  ): Promise<PaymentGatewayResult> {
    try {
      const { config, baseUrl } = await this.resolveCredentials(options);
      const body: Record<string, unknown> = {};
      if (amount !== undefined) body['amount'] = Math.round(amount * 100);

      const resp = await this.request<{ id: string; status: string }>(
        'POST',
        `${baseUrl}/transactions/${encodeURIComponent(transactionId)}/refund`,
        config.apiKey,
        body,
        options?.idempotencyKey,
      );
      this.logger.log(`Instapay refund: ${resp.id} for ${transactionId}`);
      return { success: true, transactionId: resp.id };
    } catch (err: any) {
      this.logger.error(`Instapay refund failed: ${err.message}`, err.stack);
      return {
        success: false,
        transactionId,
        errorMessage: err.message ?? 'Refund failed',
      };
    }
  }
}
