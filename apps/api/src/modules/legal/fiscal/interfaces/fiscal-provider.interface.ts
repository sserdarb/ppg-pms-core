/**
 * Country-specific e-invoice / e-archive provider contract.
 *
 * Each jurisdiction implements this with its own integrator:
 *   - TR  → GİB e-Fatura / e-Arşiv (via Foriba, Logo, QNB Finans, etc.)
 *   - EG  → ETA (Egyptian Tax Authority) e-invoice + QR
 *   - GR  → AADE myDATA e-bookkeeping
 *
 * The PMS calls `issue` after a folio is settled. The provider is fully
 * responsible for the integrator-specific transport (SOAP/REST/JSON-RPC),
 * signing, retries, and document storage. The PMS only stores the
 * returned `documentId` and `status`.
 */
export interface FiscalIssueRequest {
  propertyId: string;
  folioId: string;
  /** ISO 4217 — folio currency. */
  currency: string;
  /** Net + tax breakdown for the integrator's invoice line items. */
  lines: Array<{
    description: string;
    quantity: number;
    unitNet: string;       // decimal as string to avoid float drift
    taxCode: string;       // matches PMS taxRules.code (e.g., 'TR_KDV')
    taxRate: string;       // percent or flat per provider semantics
    taxAmount: string;
    totalGross: string;
  }>;
  buyer: {
    name: string;
    taxId?: string;        // TCKN/VKN (TR), Tax Card (EG), AFM (GR)
    countryCode: string;
    address?: string;
    email?: string;
  };
  /** Provider-specific extension blob (e.g., GR myDATA invoice type code). */
  extras?: Record<string, unknown>;
}

export interface FiscalIssueResult {
  status: 'issued' | 'queued' | 'failed';
  documentId?: string;
  documentNumber?: string;     // Human-readable invoice number from integrator
  qrPayload?: string;          // EG ETA + GR myDATA emit a QR string
  rawResponse?: unknown;       // Persist for audit, never display in UI
  errorMessage?: string;
}

export interface FiscalVoidResult {
  status: 'voided' | 'failed';
  errorMessage?: string;
}

export interface FiscalProvider {
  /** ISO 3166-1 alpha-2 of the jurisdiction this provider serves. */
  readonly countryCode: string;
  /** Stable id for logs / settings (e.g., 'tr-gib-foriba', 'eg-eta'). */
  readonly id: string;
  issue(req: FiscalIssueRequest): Promise<FiscalIssueResult>;
  voidInvoice(documentId: string): Promise<FiscalVoidResult>;
  getStatus(documentId: string): Promise<FiscalIssueResult>;
}
