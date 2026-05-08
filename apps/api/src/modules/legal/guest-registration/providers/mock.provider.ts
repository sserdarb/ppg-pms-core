import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  GuestArrivalResult,
  GuestArrivalSubmission,
  GuestRegistrationProvider,
} from '../interfaces/registration-provider.interface.js';

export class MockGuestRegistrationProvider implements GuestRegistrationProvider {
  readonly id = 'mock';
  readonly countryCode: string;
  private readonly logger = new Logger('MockGuestRegistrationProvider');

  constructor(countryCode = 'XX') {
    this.countryCode = countryCode;
  }

  async submit(req: GuestArrivalSubmission): Promise<GuestArrivalResult> {
    const registrationId = `mock-reg-${randomUUID()}`;
    this.logger.log(
      `mock-submit propertyId=${req.propertyId} reservationId=${req.reservationId} → ${registrationId}`,
    );
    return { status: 'submitted', registrationId };
  }

  async cancel(registrationId: string): Promise<GuestArrivalResult> {
    return { status: 'submitted', registrationId };
  }
}
