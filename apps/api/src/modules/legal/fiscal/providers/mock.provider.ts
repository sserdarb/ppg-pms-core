import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  FiscalIssueRequest,
  FiscalIssueResult,
  FiscalProvider,
  FiscalVoidResult,
} from '../interfaces/fiscal-provider.interface.js';

/**
 * Default fiscal provider for property's whose country has no real integrator
 * wired up yet, and for tests. Always succeeds, returns a synthetic id.
 *
 * Production deployments MUST never resolve to this provider for a country
 * where e-invoicing is mandatory (TR/EG/GR all are). The registry is the
 * gate that enforces that.
 */
export class MockFiscalProvider implements FiscalProvider {
  readonly id = 'mock';
  readonly countryCode: string;
  private readonly issued = new Map<string, FiscalIssueRequest>();
  private readonly logger = new Logger('MockFiscalProvider');

  constructor(countryCode = 'XX') {
    this.countryCode = countryCode;
  }

  async issue(req: FiscalIssueRequest): Promise<FiscalIssueResult> {
    const documentId = `mock-${randomUUID()}`;
    this.issued.set(documentId, req);
    this.logger.log(
      `mock-issue propertyId=${req.propertyId} folioId=${req.folioId} → ${documentId}`,
    );
    return {
      status: 'issued',
      documentId,
      documentNumber: documentId.slice(-12).toUpperCase(),
    };
  }

  async voidInvoice(documentId: string): Promise<FiscalVoidResult> {
    if (!this.issued.has(documentId)) {
      return { status: 'failed', errorMessage: 'documentId not found in mock' };
    }
    this.issued.delete(documentId);
    return { status: 'voided' };
  }

  async getStatus(documentId: string): Promise<FiscalIssueResult> {
    const req = this.issued.get(documentId);
    if (!req) return { status: 'failed', errorMessage: 'not found' };
    return { status: 'issued', documentId, documentNumber: documentId.slice(-12).toUpperCase() };
  }
}
