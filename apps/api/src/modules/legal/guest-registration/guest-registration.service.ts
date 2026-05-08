import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { properties } from '@telivityhaip/database';
import { DRIZZLE } from '../../../database/database.module';
import { GuestRegistrationProviderRegistry } from './registration-provider.registry';
import { GuestArrivalSubmission } from './interfaces/registration-provider.interface';

@Injectable()
export class GuestRegistrationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly registry: GuestRegistrationProviderRegistry,
  ) {}

  async submit(req: GuestArrivalSubmission) {
    const property = await this.findProperty(req.propertyId);
    const provider = this.registry.for(property.countryCode);
    const result = await provider.submit(req);
    return { provider: { id: provider.id, countryCode: provider.countryCode }, result };
  }

  async cancel(propertyId: string, registrationId: string) {
    const property = await this.findProperty(propertyId);
    const provider = this.registry.for(property.countryCode);
    return provider.cancel(registrationId);
  }

  listRegistered() {
    return this.registry.listRegistered();
  }

  private async findProperty(propertyId: string) {
    const [row] = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    if (!row) throw new NotFoundException(`Property ${propertyId} not found`);
    return row;
  }
}
