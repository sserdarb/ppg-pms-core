import {
  Controller,
  Post,
  Req,
  Res,
  Logger,
  BadRequestException,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { eq } from 'drizzle-orm';
import { createHmac } from 'crypto';
import { payments } from '@telivityhaip/database';
import { DRIZZLE } from '../../database/database.module';
import { WebhookService } from '../webhook/webhook.service';
import { FolioService } from '../folio/folio.service';
import { PropertyPaymentSettingsService } from './property-payment-settings.service';
import { SecretCipherService } from './secret-cipher.service';

interface InstapayEvent {
  id: string;
  type:
    | 'transaction.authorized'
    | 'transaction.captured'
    | 'transaction.failed'
    | 'transaction.voided'
    | 'transaction.refunded'
    | 'transaction.partially_refunded'
    | string;
  data: {
    transactionId: string;
    propertyId?: string;
    merchantId?: string;
    amount?: number;
    currency?: string;
    failureReason?: string;
  };
}

/**
 * Instapay webhook controller.
 *
 * The PSP (Paymob / NBE-IPN / Fawry / CIB) calls back here after the guest
 * completes (or abandons) the bank-app consent step, and again at settlement
 * time. We:
 *
 *  1. Locate the payment row by `gatewayTransactionId` so we can resolve the
 *     property — webhooks must NOT trust a propertyId from the request body
 *     directly (would let an attacker target another tenant's records).
 *  2. Look up the property's Instapay apiKey (decrypted) and verify the
 *     `X-Instapay-Signature` header is HMAC-SHA256(rawBody, apiKey).
 *  3. Map the event type to a payment status update and emit the matching
 *     internal webhook for downstream consumers.
 *
 * Always returns 200 once the signature is valid even if the event is a
 * duplicate or the mapping is a no-op — PSPs retry on non-2xx.
 */
@ApiTags('webhooks')
@Controller('webhooks/instapay')
export class InstapayWebhookController {
  private readonly logger = new Logger(InstapayWebhookController.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly webhookService: WebhookService,
    private readonly folioService: FolioService,
    private readonly settingsService: PropertyPaymentSettingsService,
    private readonly cipher: SecretCipherService,
  ) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Instapay PSP webhook receiver' })
  @ApiExcludeEndpoint()
  async handle(@Req() req: any, @Res() res: any) {
    const rawBody: Buffer | string | undefined = Buffer.isBuffer(req.body)
      ? (req.body as Buffer)
      : ((req as any).rawBody as Buffer | string | undefined);
    if (!rawBody) {
      throw new BadRequestException(
        'Raw body not available. Ensure express.raw() middleware is configured for /api/v1/webhooks/instapay in main.ts.',
      );
    }
    const rawBuf = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);

    let event: InstapayEvent;
    try {
      event = JSON.parse(rawBuf.toString('utf8'));
    } catch (err: any) {
      throw new BadRequestException(`Invalid JSON: ${err.message}`);
    }

    const signature = (req.headers['x-instapay-signature'] ??
      req.headers['x-signature']) as string | undefined;
    if (!signature) {
      throw new UnauthorizedException('Missing X-Instapay-Signature header');
    }

    const transactionId = event?.data?.transactionId;
    if (!transactionId) {
      throw new BadRequestException('Event missing data.transactionId');
    }

    // Resolve the payment row first — this gives us the trusted propertyId.
    const payment = await this.findPaymentByGatewayTransactionId(transactionId);
    if (!payment) {
      // Unknown transaction — do not 4xx (PSP would retry forever); log and ack.
      this.logger.warn(
        `Instapay webhook for unknown transactionId ${transactionId} (event ${event.id})`,
      );
      return res.status(200).json({ received: true, ignored: true });
    }

    // Verify HMAC against the property's Instapay apiKey (the shared secret).
    const config = await this.settingsService.getInstapayConfig(payment.propertyId);
    const expected = createHmac('sha256', config.apiKey)
      .update(rawBuf)
      .digest('hex');
    if (!this.cipher.safeEquals(expected, signature.trim())) {
      this.logger.error(
        `Instapay webhook signature mismatch for transaction ${transactionId}`,
      );
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.log(`Instapay webhook ${event.type} (${event.id}) for ${transactionId}`);

    try {
      await this.dispatch(event, payment);
    } catch (err: any) {
      // Same posture as Stripe receiver — log and ack, since downstream
      // failures shouldn't trigger PSP retry storms; surface for follow-up.
      this.logger.error(
        `Error processing Instapay webhook ${event.type}: ${err.message}`,
        err.stack,
      );
    }

    return res.status(200).json({ received: true });
  }

  private async dispatch(event: InstapayEvent, payment: any) {
    switch (event.type) {
      case 'transaction.authorized':
        return this.applyStatus(payment, 'authorized', event);
      case 'transaction.captured':
        return this.applyCaptured(payment, event);
      case 'transaction.failed':
        return this.applyFailed(payment, event);
      case 'transaction.voided':
        return this.applyVoided(payment, event);
      case 'transaction.refunded':
        return this.applyRefunded(payment, event, 'refunded');
      case 'transaction.partially_refunded':
        return this.applyRefunded(payment, event, 'partially_refunded');
      default:
        this.logger.debug(`Unhandled Instapay event type: ${event.type}`);
    }
  }

  private async applyStatus(payment: any, status: string, event: InstapayEvent) {
    if (payment.status === status) return;
    await this.db
      .update(payments)
      .set({ status, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await this.webhookService.emit(
      'payment.received',
      'payment',
      payment.id,
      { folioId: payment.folioId, status, instapayEvent: event.id },
      payment.propertyId,
    );
  }

  private async applyCaptured(payment: any, event: InstapayEvent) {
    if (payment.status === 'captured') return;
    await this.db
      .update(payments)
      .set({ status: 'captured', processedAt: new Date(), updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await this.folioService.recalculateBalance(payment.folioId, payment.propertyId);
    await this.webhookService.emit(
      'payment.received',
      'payment',
      payment.id,
      { folioId: payment.folioId, status: 'captured', instapayEvent: event.id },
      payment.propertyId,
    );
  }

  private async applyFailed(payment: any, event: InstapayEvent) {
    if (payment.status === 'failed') return;
    const note = event.data.failureReason ?? 'Instapay reported failure';
    await this.db
      .update(payments)
      .set({ status: 'failed', notes: note, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await this.folioService.recalculateBalance(payment.folioId, payment.propertyId);
    await this.webhookService.emit(
      'payment.failed',
      'payment',
      payment.id,
      { folioId: payment.folioId, error: note, instapayEvent: event.id },
      payment.propertyId,
    );
  }

  private async applyVoided(payment: any, event: InstapayEvent) {
    if (payment.status === 'voided') return;
    await this.db
      .update(payments)
      .set({ status: 'voided', updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await this.folioService.recalculateBalance(payment.folioId, payment.propertyId);
    await this.webhookService.emit(
      'payment.failed',
      'payment',
      payment.id,
      { folioId: payment.folioId, status: 'voided', instapayEvent: event.id },
      payment.propertyId,
    );
  }

  private async applyRefunded(
    payment: any,
    event: InstapayEvent,
    status: 'refunded' | 'partially_refunded',
  ) {
    if (['refunded', 'partially_refunded'].includes(payment.status)) return;
    await this.db
      .update(payments)
      .set({ status, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await this.folioService.recalculateBalance(payment.folioId, payment.propertyId);
    await this.webhookService.emit(
      'payment.refunded',
      'payment',
      payment.id,
      { folioId: payment.folioId, status, instapayEvent: event.id },
      payment.propertyId,
    );
  }

  private async findPaymentByGatewayTransactionId(transactionId: string) {
    const [payment] = await this.db
      .select()
      .from(payments)
      .where(eq(payments.gatewayTransactionId, transactionId));
    return payment ?? null;
  }
}
