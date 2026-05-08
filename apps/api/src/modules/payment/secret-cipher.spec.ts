import { ConfigService } from '@nestjs/config';
import { SecretCipherService } from './secret-cipher.service';

function makeCipher(env: Record<string, string | undefined>): SecretCipherService {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  const svc = new SecretCipherService(config);
  svc.onModuleInit();
  return svc;
}

describe('SecretCipherService', () => {
  it('passes through when no key is configured (dev fallback)', () => {
    const svc = makeCipher({});
    expect(svc.isEnabled()).toBe(false);
    const out = svc.encrypt('hello');
    expect(out).toBe('hello');
    expect(svc.isEncrypted(out)).toBe(false);
    expect(svc.decrypt(out)).toBe('hello');
  });

  it('round-trips with a passphrase-derived key', () => {
    const svc = makeCipher({ PAYMENT_SECRETS_PASSPHRASE: 'integration-test' });
    expect(svc.isEnabled()).toBe(true);
    const ct = svc.encrypt('sk_live_supersecret');
    expect(svc.isEncrypted(ct)).toBe(true);
    expect(ct).not.toContain('sk_live_supersecret');
    expect(svc.decrypt(ct)).toBe('sk_live_supersecret');
  });

  it('round-trips with a hex master key', () => {
    const hexKey = '0'.repeat(64); // 32 bytes
    const svc = makeCipher({ PAYMENT_SECRETS_KEY: hexKey });
    expect(svc.isEnabled()).toBe(true);
    expect(svc.decrypt(svc.encrypt('payload'))).toBe('payload');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const svc = makeCipher({ PAYMENT_SECRETS_PASSPHRASE: 'iv-test' });
    const a = svc.encrypt('same plaintext');
    const b = svc.encrypt('same plaintext');
    expect(a).not.toBe(b);
    expect(svc.decrypt(a)).toBe(svc.decrypt(b));
  });

  it('fails authenticated decryption when ciphertext is tampered', () => {
    const svc = makeCipher({ PAYMENT_SECRETS_PASSPHRASE: 'tamper-test' });
    const ct = svc.encrypt('payload');
    // Flip the last char of the inner base64 to corrupt the auth tag.
    const corrupted = ct.slice(0, -2) + (ct.slice(-2)[0] === 'A' ? 'B' : 'A') + ct.slice(-1);
    expect(() => svc.decrypt(corrupted)).toThrow();
  });

  it('safeEquals handles different lengths and matching strings', () => {
    const svc = makeCipher({});
    expect(svc.safeEquals('abc', 'abc')).toBe(true);
    expect(svc.safeEquals('abc', 'abcd')).toBe(false);
    expect(svc.safeEquals('abc', 'abd')).toBe(false);
  });
});
