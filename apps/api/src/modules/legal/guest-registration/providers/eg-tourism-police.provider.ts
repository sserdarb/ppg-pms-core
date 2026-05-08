import { Logger } from '@nestjs/common';
import {
  GuestArrivalResult,
  GuestArrivalSubmission,
  GuestRegistrationProvider,
} from '../interfaces/registration-provider.interface.js';

export class EgTourismPoliceProvider implements GuestRegistrationProvider {
  readonly id = 'eg-tourism-police';
  readonly countryCode = 'EG';
  private readonly logger = new Logger('EgTourismPoliceProvider');

  constructor(private readonly opts: { portalUrl?: string; userId?: string } = {}) {}

  async submit(req: GuestArrivalSubmission): Promise<GuestArrivalResult> {
    if (!this.opts.userId) {
      this.logger.warn(
        `eg-tourism-police not configured — queued stub for reservation=${req.reservationId}`,
      );
      return { status: 'queued' };
    }
    return { status: 'queued' };
  }
  async cancel(_id: string): Promise<GuestArrivalResult> {
    return { status: 'failed', errorMessage: 'eg-tourism-police.cancel not implemented' };
  }
}
