import { Logger } from '@nestjs/common';
import {
  FiscalIssueRequest,
  FiscalIssueResult,
  FiscalProvider,
  FiscalVoidResult,
} from '../interfaces/fiscal-provider.interface.js';

/**
 * GR myDATA (AADE) e-bookkeeping provider.
 *
 * Skeleton — production needs:
 *   1. AADE myDATA credentials (subscription + user token via TaxisNet).
 *   2. SOAP/REST envelope with invoice classification (`invoiceType`,
 *      `mark`, `uniqueId`).
 *   3. Echo of the AADE-issued `mark` + `uid` back into PMS so the
 *      printable receipt shows them.
 *
 * Env wiring later: MYDATA_USER_ID, MYDATA_SUBSCRIPTION_KEY, MYDATA_BASE_URL.
 */
export class GrMyDataFiscalProvider implements FiscalProvider {
  readonly id = 'gr-mydata';
  readonly countryCode = 'GR';
  private readonly logger = new Logger('GrMyDataFiscalProvider');

  constructor(private readonly opts: { userId?: string; baseUrl?: string } = {}) {}

  async issue(req: FiscalIssueRequest): Promise<FiscalIssueResult> {
    if (!this.opts.userId) {
      this.logger.warn(`gr-mydata userId missing — queued stub for folio=${req.folioId}`);
      return { status: 'queued' };
    }
    return { status: 'queued' };
  }
  async voidInvoice(_documentId: string): Promise<FiscalVoidResult> {
    return { status: 'failed', errorMessage: 'gr-mydata.void not implemented' };
  }
  async getStatus(_documentId: string): Promise<FiscalIssueResult> {
    return { status: 'queued' };
  }
}
