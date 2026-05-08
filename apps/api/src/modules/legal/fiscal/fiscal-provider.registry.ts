import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FiscalProvider } from './interfaces/fiscal-provider.interface.js';
import { EgEtaFiscalProvider } from './providers/eg-eta.provider.js';
import { GrMyDataFiscalProvider } from './providers/gr-mydata.provider.js';
import { MockFiscalProvider } from './providers/mock.provider.js';
import { TrGibFiscalProvider } from './providers/tr-gib.provider.js';

/**
 * Resolves a fiscal provider for a property's country.
 *
 * - If the country has a real provider AND its credentials are configured,
 *   return that.
 * - If the country has a real provider but credentials are missing, log a
 *   loud warning and return the mock so dev/staging keeps moving. Production
 *   should turn this into a hard failure (FISCAL_REQUIRE_REAL=true).
 * - If the country has no provider at all, return the mock.
 *
 * Adding a new country:
 *   1. Implement FiscalProvider.
 *   2. Register it here in `realProviders`.
 *   3. Update pms-spike/docs/01-jurisdiction-matrix.md and 05-ppg-pms-integration.md.
 */
@Injectable()
export class FiscalProviderRegistry {
  private readonly logger = new Logger(FiscalProviderRegistry.name);
  private readonly realProviders = new Map<string, FiscalProvider>();

  constructor(private readonly config: ConfigService) {
    const tr = new TrGibFiscalProvider({
      apiKey: this.config.get<string>('FORIBA_API_KEY'),
      baseUrl: this.config.get<string>('FORIBA_BASE_URL'),
    });
    const eg = new EgEtaFiscalProvider({
      clientId: this.config.get<string>('ETA_CLIENT_ID'),
      baseUrl: this.config.get<string>('ETA_BASE_URL'),
    });
    const gr = new GrMyDataFiscalProvider({
      userId: this.config.get<string>('MYDATA_USER_ID'),
      baseUrl: this.config.get<string>('MYDATA_BASE_URL'),
    });
    [tr, eg, gr].forEach((p) => this.realProviders.set(p.countryCode, p));
  }

  for(countryCode: string): FiscalProvider {
    const real = this.realProviders.get(countryCode);
    if (!real) {
      this.logger.warn(`No fiscal provider registered for ${countryCode} — using mock`);
      return new MockFiscalProvider(countryCode);
    }
    const requireReal = this.config.get<string>('FISCAL_REQUIRE_REAL') === 'true';
    if (!this.isProviderConfigured(real)) {
      const msg = `Fiscal provider for ${countryCode} (${real.id}) has no credentials configured`;
      if (requireReal) {
        throw new NotFoundException(msg);
      }
      this.logger.warn(`${msg} — falling back to mock`);
      return new MockFiscalProvider(countryCode);
    }
    return real;
  }

  /**
   * Cheap heuristic: each provider exposes its construction options under
   * `opts`. We only check that the integrator-specific *required* field is
   * truthy; deeper validation happens on first call and surfaces in logs.
   */
  private isProviderConfigured(p: FiscalProvider): boolean {
    const opts = (p as unknown as { opts?: Record<string, unknown> }).opts ?? {};
    if (p.id === 'tr-gib-foriba') return Boolean(opts['apiKey']);
    if (p.id === 'eg-eta') return Boolean(opts['clientId']);
    if (p.id === 'gr-mydata') return Boolean(opts['userId']);
    return false;
  }

  listRegistered(): Array<{ countryCode: string; id: string; configured: boolean }> {
    return Array.from(this.realProviders.values()).map((p) => ({
      countryCode: p.countryCode,
      id: p.id,
      configured: this.isProviderConfigured(p),
    }));
  }
}
