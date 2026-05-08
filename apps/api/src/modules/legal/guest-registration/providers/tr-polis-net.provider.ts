import { Logger } from '@nestjs/common';
import {
  GuestArrivalResult,
  GuestArrivalSubmission,
  GuestRegistrationProvider,
} from '../interfaces/registration-provider.interface.js';

/**
 * TR Polis Net — guest arrival reporting to EGM (Emniyet Genel Müdürlüğü).
 *
 * Skeleton. Production needs:
 *   1. Polis Net XML / web-service registration (per accommodation establishment).
 *   2. TCKN checksum validation for TR nationals before submission
 *      (https://www.nvi.gov.tr/ — algorithm in pms-spike/docs/01-jurisdiction-matrix.md).
 *   3. 24h scheduling: reservations get queued at check-in, retried until ack.
 *   4. Multi-room reservations: one submission per occupant per night.
 *
 * Env later: POLISNET_FACILITY_ID, POLISNET_USER, POLISNET_PASSWORD, POLISNET_BASE_URL.
 */
export class TrPolisNetProvider implements GuestRegistrationProvider {
  readonly id = 'tr-polis-net';
  readonly countryCode = 'TR';
  private readonly logger = new Logger('TrPolisNetProvider');

  constructor(
    private readonly opts: {
      facilityId?: string;
      user?: string;
      password?: string;
      baseUrl?: string;
    } = {},
  ) {}

  async submit(req: GuestArrivalSubmission): Promise<GuestArrivalResult> {
    if (!this.opts.facilityId || !this.opts.user) {
      this.logger.warn(
        `tr-polis-net not configured — queued stub for reservation=${req.reservationId}`,
      );
      return { status: 'queued' };
    }
    if (req.guest.nationality === 'TR' && !this.isTcknValid(req.guest.idNumber)) {
      return { status: 'failed', errorMessage: 'TCKN checksum failed' };
    }
    // TODO: build XML envelope, POST to Polis Net WS, persist returned receipt.
    return { status: 'queued' };
  }

  async cancel(_registrationId: string): Promise<GuestArrivalResult> {
    return { status: 'failed', errorMessage: 'tr-polis-net.cancel not implemented' };
  }

  /** Standard 11-digit TCKN check used at every TR identity workflow. */
  private isTcknValid(tckn: string): boolean {
    if (!/^[1-9]\d{10}$/.test(tckn)) return false;
    const d = tckn.split('').map(Number) as [number, number, number, number, number, number, number, number, number, number, number];
    const oddSum = d[0] + d[2] + d[4] + d[6] + d[8];
    const evenSum = d[1] + d[3] + d[5] + d[7];
    if ((oddSum * 7 - evenSum) % 10 !== d[9]) return false;
    const first10Sum = d[0] + d[1] + d[2] + d[3] + d[4] + d[5] + d[6] + d[7] + d[8] + d[9];
    return first10Sum % 10 === d[10];
  }
}
