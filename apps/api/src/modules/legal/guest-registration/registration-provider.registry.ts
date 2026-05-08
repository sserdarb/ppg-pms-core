import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuestRegistrationProvider } from './interfaces/registration-provider.interface.js';
import { EgTourismPoliceProvider } from './providers/eg-tourism-police.provider.js';
import { GrHellenicPoliceProvider } from './providers/gr-hellenic-police.provider.js';
import { MockGuestRegistrationProvider } from './providers/mock.provider.js';
import { TrPolisNetProvider } from './providers/tr-polis-net.provider.js';

@Injectable()
export class GuestRegistrationProviderRegistry {
  private readonly logger = new Logger(GuestRegistrationProviderRegistry.name);
  private readonly realProviders = new Map<string, GuestRegistrationProvider>();

  constructor(private readonly config: ConfigService) {
    const tr = new TrPolisNetProvider({
      facilityId: this.config.get<string>('POLISNET_FACILITY_ID'),
      user: this.config.get<string>('POLISNET_USER'),
      password: this.config.get<string>('POLISNET_PASSWORD'),
      baseUrl: this.config.get<string>('POLISNET_BASE_URL'),
    });
    const eg = new EgTourismPoliceProvider({
      portalUrl: this.config.get<string>('EG_TOURISM_POLICE_URL'),
      userId: this.config.get<string>('EG_TOURISM_POLICE_USER'),
    });
    const gr = new GrHellenicPoliceProvider({
      portalUrl: this.config.get<string>('GR_HELLENIC_POLICE_URL'),
      afmFacility: this.config.get<string>('GR_HELLENIC_POLICE_AFM'),
    });
    [tr, eg, gr].forEach((p) => this.realProviders.set(p.countryCode, p));
  }

  for(countryCode: string): GuestRegistrationProvider {
    const real = this.realProviders.get(countryCode);
    if (!real) {
      this.logger.warn(`No guest-registration provider for ${countryCode} — using mock`);
      return new MockGuestRegistrationProvider(countryCode);
    }
    const requireReal = this.config.get<string>('REGISTRATION_REQUIRE_REAL') === 'true';
    if (!this.isProviderConfigured(real)) {
      const msg = `Guest-registration provider for ${countryCode} (${real.id}) has no credentials configured`;
      if (requireReal) throw new NotFoundException(msg);
      this.logger.warn(`${msg} — falling back to mock`);
      return new MockGuestRegistrationProvider(countryCode);
    }
    return real;
  }

  private isProviderConfigured(p: GuestRegistrationProvider): boolean {
    const opts = (p as unknown as { opts?: Record<string, unknown> }).opts ?? {};
    if (p.id === 'tr-polis-net') return Boolean(opts['facilityId'] && opts['user']);
    if (p.id === 'eg-tourism-police') return Boolean(opts['userId']);
    if (p.id === 'gr-hellenic-police') return Boolean(opts['afmFacility']);
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
