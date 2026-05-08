export interface PaymentGatewayResult {
  success: boolean;
  transactionId: string;
  errorMessage?: string;
  /**
   * Optional redirect URL or hosted-page reference returned by gateways that
   * use a 3-D Secure step or a hosted checkout (e.g. Instapay's IPN consent
   * flow). Booking engine uses this to redirect the guest.
   */
  redirectUrl?: string;
}

/**
 * Optional per-call options. `idempotencyKey` is forwarded to the gateway
 * (Stripe supports `Idempotency-Key` on any mutating request) so that
 * retries of the same logical operation do not double-charge.
 *
 * `propertyId` lets multi-tenant adapters look up per-property merchant
 * credentials (Instapay merchant ID, Stripe Connect account, etc.).
 */
export interface PaymentGatewayCallOptions {
  idempotencyKey?: string;
  propertyId?: string;
}

export interface PaymentGateway {
  /** Stable provider name as stored in `payments.gateway_provider` */
  readonly name: string;

  authorize(
    token: string,
    amount: number,
    currency: string,
    options?: PaymentGatewayCallOptions,
  ): Promise<PaymentGatewayResult>;
  capture(
    transactionId: string,
    amount?: number,
    options?: PaymentGatewayCallOptions,
  ): Promise<PaymentGatewayResult>;
  void(
    transactionId: string,
    options?: PaymentGatewayCallOptions,
  ): Promise<PaymentGatewayResult>;
  refund(
    transactionId: string,
    amount?: number,
    options?: PaymentGatewayCallOptions,
  ): Promise<PaymentGatewayResult>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
export const PAYMENT_GATEWAY_REGISTRY = Symbol('PAYMENT_GATEWAY_REGISTRY');
