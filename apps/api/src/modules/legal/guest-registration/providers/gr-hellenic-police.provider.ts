import { Logger } from '@nestjs/common';
import {
  GuestArrivalResult,
  GuestArrivalSubmission,
  GuestRegistrationProvider,
} from '../interfaces/registration-provider.interface.js';

export class GrHellenicPoliceProvider implements GuestRegistrationProvider {
  readonly id = 'gr-hellenic-police';
  readonly countryCode = 'GR';
  private readonly logger = new Logger('GrHellenicPoliceProvider');

  constructor(private readonly opts: { portalUrl?: string; afmFacility?: string } = {}) {}

  async submit(req: GuestArrivalSubmission): Promise<GuestArrivalResult> {
    if (!this.opts.afmFacility) {
      this.logger.warn(
        `gr-hellenic-police not configured — queued stub for reservation=${req.reservationId}`,
      );
      return { status: 'queued' };
    }
    return { status: 'queued' };
  }
  async cancel(_id: string): Promise<GuestArrivalResult> {
    return { status: 'failed', errorMessage: 'gr-hellenic-police.cancel not implemented' };
  }
}
