import { Logger } from '@nestjs/common';
import {
  FiscalIssueRequest,
  FiscalIssueResult,
  FiscalProvider,
  FiscalVoidResult,
} from '../interfaces/fiscal-provider.interface.js';

/**
 * TR GİB e-Fatura / e-Arşiv via Foriba (default integrator).
 *
 * Skeleton only — production rollout still needs:
 *   1. Foriba commercial agreement + sandbox credentials.
 *   2. UBL-TR 2.1 envelope construction (use @ubl-foundation/ubl-tr).
 *   3. Webhook subscription for status callbacks (Foriba pushes async results).
 *   4. Pivot rule: invoices ≥ 5 000 TL must be e-Fatura (B2B with VKN);
 *      below that or to TCKN buyers → e-Arşiv. Encoded in `pickKind()`.
 *
 * Today this stub returns 'queued' so calling code paths can be exercised
 * without hitting the real GİB sandbox. Wire `FORIBA_API_KEY` /
 * `FORIBA_BASE_URL` in env when implementing.
 */
export class TrGibFiscalProvider implements FiscalProvider {
  readonly id = 'tr-gib-foriba';
  readonly countryCode = 'TR';
  private readonly logger = new Logger('TrGibFiscalProvider');

  constructor(
    private readonly opts: {
      apiKey?: string;
      baseUrl?: string;
      defaultBuyerKind?: 'efatura' | 'earsiv';
    } = {},
  ) {}

  private pickKind(req: FiscalIssueRequest): 'efatura' | 'earsiv' {
    const isVkn = (req.buyer.taxId ?? '').replace(/\D/g, '').length === 10;
    const total = req.lines.reduce((acc, l) => acc + Number(l.totalGross), 0);
    if (isVkn && total >= 5000) return 'efatura';
    return 'earsiv';
  }

  async issue(req: FiscalIssueRequest): Promise<FiscalIssueResult> {
    if (req.buyer.countryCode !== 'TR') {
      return { status: 'failed', errorMessage: 'TR provider can only issue for TR buyers' };
    }
    const kind = this.pickKind(req);
    if (!this.opts.apiKey) {
      this.logger.warn(
        `tr-gib-foriba apiKey missing — returning queued stub for folio=${req.folioId} kind=${kind}`,
      );
      return { status: 'queued' };
    }
    // TODO: build UBL-TR envelope, sign, POST to Foriba, parse response.
    return { status: 'queued' };
  }

  async voidInvoice(_documentId: string): Promise<FiscalVoidResult> {
    return { status: 'failed', errorMessage: 'tr-gib-foriba.void not implemented' };
  }

  async getStatus(_documentId: string): Promise<FiscalIssueResult> {
    return { status: 'queued' };
  }
}
