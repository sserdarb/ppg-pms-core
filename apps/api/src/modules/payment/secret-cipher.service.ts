import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'crypto';

/**
 * AES-256-GCM cipher for at-rest secrets stored in JSONB.
 *
 * Used for per-property merchant credentials (Instapay apiKey, future
 * provider secrets). The master key comes from `PAYMENT_SECRETS_KEY`; in
 * production this should be sourced from a real KMS / secrets manager. For
 * dev / CI a key may be derived from `PAYMENT_SECRETS_PASSPHRASE` so a
 * passphrase suffices instead of raw key material.
 *
 * Ciphertext format (base64-encoded JSON):
 *   { v: 1, alg: 'aes-256-gcm', iv, tag, data, kid? }
 *
 * `kid` (key id) lets us rotate the master key without rewriting every row
 * synchronously — the cipher tries each registered key until decrypt
 * succeeds. Today only one key is supported; the field exists so a future
 * rotation doesn't require a schema migration.
 *
 * Strings are tagged with the `enc:v1:` prefix so callers can cheaply
 * distinguish plaintext (legacy / migration) from ciphertext when reading
 * mixed-state data.
 */
const PREFIX = 'enc:v1:';
const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // GCM standard

@Injectable()
export class SecretCipherService implements OnModuleInit {
  private readonly logger = new Logger(SecretCipherService.name);
  private masterKey: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.masterKey = this.resolveMasterKey();
    if (!this.masterKey) {
      this.logger.warn(
        'PAYMENT_SECRETS_KEY / PAYMENT_SECRETS_PASSPHRASE not set — Instapay/PSP API keys will be stored in PLAINTEXT. Configure a key before going live.',
      );
    }
  }

  private resolveMasterKey(): Buffer | null {
    const rawKey = this.config.get<string>('PAYMENT_SECRETS_KEY');
    if (rawKey) {
      // Accept hex (64 chars) or base64 (44 chars incl '=') for a 32-byte key.
      try {
        if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
          return Buffer.from(rawKey, 'hex');
        }
        const buf = Buffer.from(rawKey, 'base64');
        if (buf.length === KEY_LEN) return buf;
      } catch {
        // fall through
      }
      this.logger.error(
        'PAYMENT_SECRETS_KEY is set but is not a valid 32-byte hex or base64 key — falling back to passphrase / plaintext',
      );
    }

    const passphrase = this.config.get<string>('PAYMENT_SECRETS_PASSPHRASE');
    if (passphrase) {
      // Derive a stable 32-byte key from the passphrase. The salt is fixed by
      // design so the same passphrase produces the same key across boots —
      // suitable for dev/CI; production should set PAYMENT_SECRETS_KEY directly.
      return scryptSync(passphrase, 'haip-payment-secrets', KEY_LEN);
    }

    return null;
  }

  /** True if the encryption layer is wired up. */
  isEnabled(): boolean {
    return this.masterKey !== null;
  }

  /** True if the value looks like a ciphertext we produced. */
  isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX);
  }

  /**
   * Encrypt a plaintext secret. Returns a self-describing string. If the
   * service has no master key configured (dev convenience), returns the
   * plaintext unchanged with a warning logged once at startup.
   */
  encrypt(plaintext: string): string {
    if (!this.masterKey) return plaintext;
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const data = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const payload = {
      v: 1,
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: data.toString('base64'),
    };
    return PREFIX + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
  }

  /**
   * Decrypt a ciphertext produced by `encrypt`. Plaintext (legacy unencrypted
   * rows from before this service was wired up) is returned unchanged.
   */
  decrypt(value: string): string {
    if (!this.isEncrypted(value)) return value;
    if (!this.masterKey) {
      throw new Error(
        'Cannot decrypt — PAYMENT_SECRETS_KEY/PASSPHRASE not configured but encrypted value present',
      );
    }
    const body = value.slice(PREFIX.length);
    const payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
    if (payload.alg !== 'aes-256-gcm') {
      throw new Error(`Unsupported cipher alg: ${payload.alg}`);
    }
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const data = Buffer.from(payload.data, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  /**
   * Constant-time comparison of two strings. Useful when a webhook signature
   * is verified against a stored shared secret.
   */
  safeEquals(a: string, b: string): boolean {
    const aBuf = Buffer.from(a, 'utf8');
    const bBuf = Buffer.from(b, 'utf8');
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  }
}
