import { Logger } from '@nestjs/common';
import {
  FiscalIssueRequest,
  FiscalIssueResult,
  FiscalProvider,
  FiscalVoidResult,
} from '../interfaces/fiscal-provider.interface.js';

/**
 * EG ETA (Egyptian Tax Authority) e-invoice provider.
 *
 * Skeleton — production needs:
 *   1. ETA developer account + portal client_id/client_secret.
 *   2. JSON document v1.1 schema with PNG QR encoded with the UUID + total.
 *   3. Async submission lifecycle (`Submitted` → `Valid` / `Invalid`).
 *   4. Hijri-aware date for `dateTimeIssued` if requested by the property.
 *
 * Env wiring later: ETA_CLIENT_ID, ETA_CLIENT_SECRET, ETA_BASE_URL.
 */
export class EgEtaFiscalProvider implements FiscalProvider {
  readonly id = 'eg-eta';
  readonly countryCode = 'EG';
  private readonly logger = new Logger('EgEtaFiscalProvider');

  constructor(private readonly opts: { clientId?: string; baseUrl?: string } = {}) {}

  async issue(req: FiscalIssueRequest): Promise<FiscalIssueResult> {
    if (!this.opts.clientId) {
      this.logger.warn(`eg-eta clientId missing — queued stub for folio=${req.folioId}`);
      return { status: 'queued' };
    }
    return { status: 'queued' };
  }
  async voidInvoice(_documentId: string): Promise<FiscalVoidResult> {
    return { status: 'failed', errorMessage: 'eg-eta.void not implemented' };
  }
  async getStatus(_documentId: string): Promise<FiscalIssueResult> {
    return { status: 'queued' };
  }
}
