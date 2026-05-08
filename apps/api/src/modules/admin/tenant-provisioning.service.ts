import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import {
  agentWebhookSubscriptions,
  properties,
  taxProfiles,
  taxRules,
} from '@telivityhaip/database';
import { DRIZZLE } from '../../database/database.module';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';

/**
 * Event types pushed to the PPG event bus by default. Aligned with
 * pms-spike/docs/05-ppg-pms-integration.md §2 ("Critical events"):
 * - reservation.* → cancellation prediction, guest comms
 * - folio.* → revenue analytics
 * - night_audit.* → anomaly detection
 * - review.* → review-response agent (NVIDIA AI)
 * - availability.* → yield agent (Lumitours competitor pricing)
 */
const PPG_DEFAULT_EVENTS = [
  'reservation.created',
  'reservation.updated',
  'reservation.cancelled',
  'reservation.checked_in',
  'reservation.checked_out',
  'folio.settled',
  'folio.charge_added',
  'night_audit.completed',
  'review.received',
  'availability.changed',
];

const PPG_SUBSCRIBER_ID = 'ppg-event-bus';

interface JurisdictionDefault {
  jurisdictionCode: string;
  profileName: string;
  rules: Array<{
    name: string;
    code: string;
    type: 'percentage' | 'flat_per_night' | 'flat_per_stay' | 'split_component';
    rate: string;
    appliesToChargeTypes: string[];
    sortOrder: number;
  }>;
}

/**
 * Per-country default tax setup applied when applyDefaultTaxes=true.
 * Sourced from pms-spike/docs/01-jurisdiction-matrix.md. Add new countries
 * here; the service falls through to "no defaults" when the country has
 * no entry, which is the right answer for jurisdictions we have not yet
 * mapped (better to require an explicit operator decision than to assume).
 */
const JURISDICTION_DEFAULTS: Record<string, JurisdictionDefault> = {
  TR: {
    jurisdictionCode: 'TR-NATIONAL',
    profileName: 'Türkiye varsayılan vergi profili',
    rules: [
      { name: 'KDV (Konaklama)', code: 'TR_KDV', type: 'percentage', rate: '10.0000', appliesToChargeTypes: ['room', 'food_beverage', 'minibar'], sortOrder: 10 },
      { name: 'Konaklama Vergisi', code: 'TR_KONAKLAMA', type: 'percentage', rate: '2.0000', appliesToChargeTypes: ['room'], sortOrder: 20 },
    ],
  },
  EG: {
    jurisdictionCode: 'EG-NATIONAL',
    profileName: 'Egypt default tax profile',
    rules: [
      { name: 'Egypt VAT', code: 'EG_VAT', type: 'percentage', rate: '14.0000', appliesToChargeTypes: ['room', 'food_beverage', 'minibar', 'spa'], sortOrder: 10 },
      { name: 'Tourism Tax', code: 'EG_TOURISM', type: 'flat_per_night', rate: '50.0000', appliesToChargeTypes: ['room'], sortOrder: 20 },
    ],
  },
  GR: {
    jurisdictionCode: 'GR-NATIONAL',
    profileName: 'Greece default tax profile',
    rules: [
      { name: 'FPA (Hotel)', code: 'GR_FPA', type: 'percentage', rate: '13.0000', appliesToChargeTypes: ['room', 'food_beverage'], sortOrder: 10 },
      { name: 'Climate Resilience Stayover Tax (peak, 5*)', code: 'GR_CLIMATE', type: 'flat_per_night', rate: '10.0000', appliesToChargeTypes: ['room'], sortOrder: 20 },
    ],
  },
};

@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  // db type matches the rest of the codebase (`any` from DRIZZLE) — narrowing
  // it would diverge from how every other service in HAIP holds the handle.
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly config: ConfigService,
  ) {}

  /**
   * Idempotent: if a property with this ppgPropertyId already exists, the
   * call updates its mutable fields and returns the same id. Tax defaults
   * are applied once (when the profile does not yet exist for the property).
   */
  async provision(dto: ProvisionTenantDto) {
    const code = dto.code ?? this.derivePropertyCode(dto.ppgPropertyId);
    const now = new Date();

    const existing = await this.db
      .select()
      .from(properties)
      .where(eq(properties.externalId, dto.ppgPropertyId))
      .limit(1);

    let propertyId: string;
    let created: boolean;

    if (existing.length > 0) {
      propertyId = existing[0].id;
      created = false;
      await this.db
        .update(properties)
        .set({
          name: dto.name,
          countryCode: dto.countryCode,
          currencyCode: dto.currencyCode,
          timezone: dto.timezone,
          defaultLanguage: dto.defaultLanguage ?? existing[0].defaultLanguage,
          totalRooms: dto.totalRooms,
          city: dto.city ?? existing[0].city,
          addressLine1: dto.addressLine1 ?? existing[0].addressLine1,
          isActive: true,
          updatedAt: now,
        })
        .where(eq(properties.id, propertyId));
      this.logger.log(`Tenant ${dto.ppgPropertyId} re-synced (propertyId=${propertyId})`);
    } else {
      const [row] = await this.db
        .insert(properties)
        .values({
          name: dto.name,
          code,
          countryCode: dto.countryCode,
          currencyCode: dto.currencyCode,
          timezone: dto.timezone,
          defaultLanguage: dto.defaultLanguage ?? 'en',
          totalRooms: dto.totalRooms,
          city: dto.city,
          addressLine1: dto.addressLine1,
          externalId: dto.ppgPropertyId,
          provisionedBy: 'ppg-master-panel',
          provisionedAt: now,
        })
        .returning();
      propertyId = row.id;
      created = true;
      this.logger.log(`Tenant ${dto.ppgPropertyId} provisioned (propertyId=${propertyId})`);
    }

    const taxApplied = await this.applyTaxDefaultsIfMissing(
      propertyId,
      dto.countryCode,
      dto.applyDefaultTaxes ?? true,
    );

    const eventBusBound = await this.bindPpgEventBusIfConfigured(propertyId);

    return {
      propertyId,
      externalId: dto.ppgPropertyId,
      created,
      taxApplied,
      eventBusBound,
      jurisdictionDefault: JURISDICTION_DEFAULTS[dto.countryCode]?.jurisdictionCode ?? null,
    };
  }

  async deactivate(externalId: string, active: boolean) {
    const [row] = await this.db
      .select()
      .from(properties)
      .where(eq(properties.externalId, externalId))
      .limit(1);
    if (!row) {
      throw new NotFoundException(`Tenant ${externalId} not found`);
    }
    await this.db
      .update(properties)
      .set({ isActive: active, updatedAt: new Date() })
      .where(eq(properties.id, row.id));
    return { propertyId: row.id, externalId, active };
  }

  async getByExternalId(externalId: string) {
    const [row] = await this.db
      .select()
      .from(properties)
      .where(eq(properties.externalId, externalId))
      .limit(1);
    if (!row) {
      throw new NotFoundException(`Tenant ${externalId} not found`);
    }
    return row;
  }

  private derivePropertyCode(ppgId: string): string {
    return ppgId
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '-')
      .slice(0, 20);
  }

  private async applyTaxDefaultsIfMissing(
    propertyId: string,
    countryCode: string,
    enabled: boolean,
  ): Promise<{ profileId: string | null; rulesAdded: number }> {
    if (!enabled) return { profileId: null, rulesAdded: 0 };
    const defaults = JURISDICTION_DEFAULTS[countryCode];
    if (!defaults) {
      this.logger.warn(`No jurisdiction default tax preset for ${countryCode}`);
      return { profileId: null, rulesAdded: 0 };
    }

    const existingProfile = await this.db
      .select()
      .from(taxProfiles)
      .where(
        and(
          eq(taxProfiles.propertyId, propertyId),
          eq(taxProfiles.jurisdictionCode, defaults.jurisdictionCode),
        ),
      )
      .limit(1);

    if (existingProfile.length > 0) {
      return { profileId: existingProfile[0].id, rulesAdded: 0 };
    }

    const [profile] = await this.db
      .insert(taxProfiles)
      .values({
        propertyId,
        name: defaults.profileName,
        jurisdictionCode: defaults.jurisdictionCode,
        effectiveFrom: new Date().toISOString().slice(0, 10),
      })
      .returning();

    let rulesAdded = 0;
    for (const r of defaults.rules) {
      await this.db.insert(taxRules).values({
        taxProfileId: profile.id,
        name: r.name,
        code: r.code,
        type: r.type,
        rate: r.rate,
        appliesToChargeTypes: r.appliesToChargeTypes,
        isCompounding: false,
        sortOrder: r.sortOrder,
        isActive: true,
        effectiveFrom: new Date().toISOString().slice(0, 10),
      });
      rulesAdded++;
    }

    return { profileId: profile.id, rulesAdded };
  }

  /**
   * Idempotent: if a `ppg-event-bus` subscription already exists for this
   * property, refresh its callbackUrl + events to match current config.
   * Returns null when PPG_EVENT_BUS_URL is not set (dev / staging without
   * an event bus wired up); the rest of the provisioning still succeeds.
   */
  private async bindPpgEventBusIfConfigured(propertyId: string): Promise<{
    subscriptionId: string;
    callbackUrl: string;
    events: string[];
    created: boolean;
  } | null> {
    const callbackUrl = this.config.get<string>('PPG_EVENT_BUS_URL');
    const secret = this.config.get<string>('PPG_EVENT_BUS_SECRET');
    if (!callbackUrl) {
      this.logger.warn(
        `PPG_EVENT_BUS_URL not configured — skipping event-bus subscription for property ${propertyId}`,
      );
      return null;
    }

    const existing = await this.db
      .select()
      .from(agentWebhookSubscriptions)
      .where(
        and(
          eq(agentWebhookSubscriptions.propertyId, propertyId),
          eq(agentWebhookSubscriptions.subscriberId, PPG_SUBSCRIBER_ID),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(agentWebhookSubscriptions)
        .set({
          callbackUrl,
          events: PPG_DEFAULT_EVENTS,
          secret: secret ?? existing[0].secret,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(agentWebhookSubscriptions.id, existing[0].id));
      return {
        subscriptionId: existing[0].id,
        callbackUrl,
        events: PPG_DEFAULT_EVENTS,
        created: false,
      };
    }

    const [row] = await this.db
      .insert(agentWebhookSubscriptions)
      .values({
        propertyId,
        subscriberId: PPG_SUBSCRIBER_ID,
        subscriberName: 'PPG Event Bus',
        callbackUrl,
        events: PPG_DEFAULT_EVENTS,
        secret: secret ?? null,
        isActive: true,
      })
      .returning();
    this.logger.log(`PPG event-bus subscription created (subscriptionId=${row.id})`);
    return {
      subscriptionId: row.id,
      callbackUrl,
      events: PPG_DEFAULT_EVENTS,
      created: true,
    };
  }
}
