/**
 * Country-specific guest arrival reporting (police / tourism authority).
 *
 *   - TR  → Polis Net (Emniyet Genel Müdürlüğü), 24h after check-in
 *   - EG  → Tourism Police (paper or regional digital portal)
 *   - GR  → Hellenic Police visitor declaration, 24h after check-in
 *
 * Fired automatically on `reservation.checked_in`. The provider is
 * responsible for transport, retries, and storing the authority's
 * receipt id (`registrationId`). The PMS persists only the result.
 */
export interface GuestArrivalSubmission {
  propertyId: string;
  reservationId: string;
  guest: {
    firstName: string;
    lastName: string;
    nationality: string;        // ISO 3166-1 alpha-2
    idType: 'passport' | 'national_id' | 'drivers_license' | string;
    idNumber: string;
    idCountry: string;          // ISO 3166-1 alpha-2
    dateOfBirth?: string;       // ISO date
    gender?: 'M' | 'F' | 'X';
  };
  arrival: {
    checkInAt: string;          // ISO timestamp
    checkOutPlannedAt: string;
    roomNumber?: string;
  };
  /** Provider-specific extension (visa info for EG, AFM for GR, etc.) */
  extras?: Record<string, unknown>;
}

export interface GuestArrivalResult {
  status: 'submitted' | 'queued' | 'failed';
  registrationId?: string;
  rawResponse?: unknown;
  errorMessage?: string;
}

export interface GuestRegistrationProvider {
  readonly countryCode: string;
  readonly id: string;
  submit(req: GuestArrivalSubmission): Promise<GuestArrivalResult>;
  cancel(registrationId: string): Promise<GuestArrivalResult>;
}
