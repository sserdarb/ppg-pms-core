import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { properties } from '@telivityhaip/database';
import { DRIZZLE } from '../../../database/database.module';
import { FiscalProviderRegistry } from './fiscal-provider.registry';
import { FiscalIssueRequest } from './interfaces/fiscal-provider.interface';

@Injectable()
export class FiscalService {
  constructor(
    @Inject(DRIZZLE) private readonly db: any,
    private readonly registry: FiscalProviderRegistry,
  ) {}

  async issue(req: FiscalIssueRequest) {
    const property = await this.findProperty(req.propertyId);
    const provider = this.registry.for(property.countryCode);
    const result = await provider.issue(req);
    return { provider: { id: provider.id, countryCode: provider.countryCode }, result };
  }

  async voidInvoice(propertyId: string, documentId: string) {
    const property = await this.findProperty(propertyId);
    const provider = this.registry.for(property.countryCode);
    return provider.voidInvoice(documentId);
  }

  async getStatus(propertyId: string, documentId: string) {
    const property = await this.findProperty(propertyId);
    const provider = this.registry.for(property.countryCode);
    return provider.getStatus(documentId);
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
