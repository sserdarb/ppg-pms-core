import { Test, TestingModule } from '@nestjs/testing';
import { InstapayGateway } from './instapay-gateway';
import { PropertyPaymentSettingsService } from './property-payment-settings.service';
import { PaymentGatewayRegistry } from './payment-gateway-registry';

const PROPERTY_ID = '11111111-1111-1111-1111-111111111111';

function makeSettingsStub(overrides: Partial<any> = {}) {
  return {
    getInstapayConfig: vi.fn().mockResolvedValue({
      enabled: true,
      merchantId: 'm_test',
      apiKey: 'k_test',
      environment: 'sandbox',
      callbackUrl: 'https://hotel.example/return',
      ...overrides,
    }),
  } as unknown as PropertyPaymentSettingsService;
}

describe('InstapayGateway', () => {
  let gateway: InstapayGateway;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstapayGateway,
        { provide: PropertyPaymentSettingsService, useValue: makeSettingsStub() },
      ],
    }).compile();
    gateway = module.get(InstapayGateway);
    fetchSpy = vi.spyOn(globalThis, 'fetch' as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('exposes the provider name as "instapay"', () => {
    expect(gateway.name).toBe('instapay');
  });

  it('rejects non-EGP currencies without calling the network', async () => {
    const result = await gateway.authorize('payer-alias', 100, 'USD', {
      propertyId: PROPERTY_ID,
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('only supports EGP');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('errors if propertyId is missing — credentials cannot be resolved', async () => {
    const result = await gateway.authorize('payer-alias', 100, 'EGP');
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('propertyId');
  });

  it('authorizes with merchant credentials and surfaces redirectUrl', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'tx_123',
          status: 'requires_action',
          redirectUrl: 'https://bank.example/consent/abc',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ) as any,
    );

    const result = await gateway.authorize('01000000000', 250, 'EGP', {
      propertyId: PROPERTY_ID,
      idempotencyKey: 'auth-1',
    });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBe('tx_123');
    expect(result.redirectUrl).toBe('https://bank.example/consent/abc');

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toContain('/transactions');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe('Bearer k_test');
    expect((init?.headers as Record<string, string>)['Idempotency-Key']).toBe('auth-1');
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      merchantId: 'm_test',
      amount: 25000, // piastres
      currency: 'EGP',
      payerRef: '01000000000',
      captureMode: 'manual',
    });
  });

  it('returns a structured failure when the PSP returns a 4xx', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'merchant suspended' } }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }) as any,
    );

    const result = await gateway.authorize('01000000000', 100, 'EGP', {
      propertyId: PROPERTY_ID,
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe('merchant suspended');
  });

  it('captures an authorized transaction with optional partial amount', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ id: 'tx_123', status: 'captured' }), {
        status: 200,
      }) as any,
    );
    const result = await gateway.capture('tx_123', 75, { propertyId: PROPERTY_ID });
    expect(result.success).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toContain('/transactions/tx_123/capture');
    expect(JSON.parse(init?.body as string)).toEqual({ amount: 7500 });
  });
});

describe('PaymentGatewayRegistry', () => {
  it('returns the registered gateway by name', () => {
    const registry = new PaymentGatewayRegistry();
    const fake: any = { name: 'instapay' };
    registry.register(fake);
    expect(registry.has('instapay')).toBe(true);
    expect(registry.get('instapay')).toBe(fake);
    expect(registry.list()).toEqual(['instapay']);
  });

  it('throws BadRequest for unknown providers', () => {
    const registry = new PaymentGatewayRegistry();
    expect(() => registry.get('nope')).toThrow(/Unsupported payment gateway/);
  });
});
