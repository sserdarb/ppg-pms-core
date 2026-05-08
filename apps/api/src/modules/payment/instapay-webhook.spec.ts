import { createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstapayWebhookController } from './instapay-webhook.controller';
import { SecretCipherService } from './secret-cipher.service';

const PROPERTY_ID = '11111111-1111-1111-1111-111111111111';
const TX = 'tx_abc';
const API_KEY = 'shared-secret';

function makeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function buildController(opts: {
  payment?: any;
  config?: { apiKey: string; merchantId: string; environment: 'sandbox' | 'live'; enabled: boolean };
} = {}) {
  const payment = 'payment' in opts
    ? opts.payment
    : {
        id: 'pay-1',
        propertyId: PROPERTY_ID,
        folioId: 'folio-1',
        status: 'authorized',
      };

  const updates: any[] = [];
  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(payment ? [payment] : []),
      }),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((patch: any) => {
        updates.push(patch);
        return { where: vi.fn().mockResolvedValue([]) };
      }),
    })),
  };
  const webhookService = { emit: vi.fn().mockResolvedValue(undefined) };
  const folioService = { recalculateBalance: vi.fn().mockResolvedValue(undefined) };
  const settingsService: any = {
    getInstapayConfig: vi.fn().mockResolvedValue(
      opts.config ?? {
        enabled: true,
        merchantId: 'm',
        apiKey: API_KEY,
        environment: 'sandbox',
      },
    ),
  };
  const cipher = new SecretCipherService({ get: () => undefined } as unknown as ConfigService);
  cipher.onModuleInit();

  const controller = new InstapayWebhookController(
    db as any,
    webhookService as any,
    folioService as any,
    settingsService as any,
    cipher,
  );

  return { controller, db, webhookService, folioService, settingsService, updates };
}

function signedRequest(payload: any, signKey = API_KEY) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const signature = createHmac('sha256', signKey).update(body).digest('hex');
  return {
    body,
    headers: { 'x-instapay-signature': signature },
  };
}

describe('InstapayWebhookController', () => {
  it('rejects requests without a signature header', async () => {
    const { controller } = buildController();
    const res = makeRes();
    const req = { body: Buffer.from('{}'), headers: {} } as any;
    await expect(controller.handle(req, res)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects forged signatures', async () => {
    const { controller } = buildController();
    const res = makeRes();
    const evt = { id: 'e1', type: 'transaction.captured', data: { transactionId: TX } };
    const { body } = signedRequest(evt, 'wrong-secret');
    const req = {
      body,
      headers: { 'x-instapay-signature': 'deadbeef' },
    } as any;
    await expect(controller.handle(req, res)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('acks unknown transactionIds (200 + ignored:true) without 4xx', async () => {
    const { controller, db } = buildController({ payment: null });
    const res = makeRes();
    const evt = { id: 'e1', type: 'transaction.captured', data: { transactionId: 'unknown' } };
    const { body, headers } = signedRequest(evt);
    const req = { body, headers } as any;
    await controller.handle(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true, ignored: true });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('captures a payment + recalculates balance + emits internal event', async () => {
    const { controller, updates, folioService, webhookService } = buildController();
    const res = makeRes();
    const evt = { id: 'e1', type: 'transaction.captured', data: { transactionId: TX } };
    const { body, headers } = signedRequest(evt);
    const req = { body, headers } as any;
    await controller.handle(req, res);

    expect(updates[0]).toMatchObject({ status: 'captured' });
    expect(folioService.recalculateBalance).toHaveBeenCalledWith('folio-1', PROPERTY_ID);
    expect(webhookService.emit).toHaveBeenCalledWith(
      'payment.received',
      'payment',
      'pay-1',
      expect.objectContaining({ status: 'captured', instapayEvent: 'e1' }),
      PROPERTY_ID,
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('marks failed events with the failure reason as a note', async () => {
    const { controller, updates } = buildController();
    const res = makeRes();
    const evt = {
      id: 'e2',
      type: 'transaction.failed',
      data: { transactionId: TX, failureReason: 'insufficient_funds' },
    };
    const { body, headers } = signedRequest(evt);
    await controller.handle({ body, headers } as any, res);
    expect(updates[0]).toMatchObject({
      status: 'failed',
      notes: 'insufficient_funds',
    });
  });

  it('is idempotent — already-captured payments do not re-update or re-emit', async () => {
    const { controller, db, webhookService } = buildController({
      payment: { id: 'pay-1', propertyId: PROPERTY_ID, folioId: 'folio-1', status: 'captured' },
    });
    const res = makeRes();
    const evt = { id: 'e1', type: 'transaction.captured', data: { transactionId: TX } };
    const { body, headers } = signedRequest(evt);
    await controller.handle({ body, headers } as any, res);
    expect(db.update).not.toHaveBeenCalled();
    expect(webhookService.emit).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
