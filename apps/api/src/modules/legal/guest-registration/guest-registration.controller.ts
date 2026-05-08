import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ServiceTokenGuard } from '../../admin/service-token.guard';
import { GuestRegistrationService } from './guest-registration.service';
import { SubmitArrivalDto } from './dto/submit-arrival.dto';

@ApiTags('legal-guest-registration')
@ApiBearerAuth()
@UseGuards(ServiceTokenGuard)
@Controller('admin/guest-registration')
export class GuestRegistrationController {
  constructor(private readonly svc: GuestRegistrationService) {}

  @Get('providers')
  @ApiOperation({ summary: 'List registered guest-registration providers and configuration state' })
  list() {
    return this.svc.listRegistered();
  }

  @Post('submit')
  @ApiOperation({
    summary: 'Submit a guest arrival to the police / tourism authority',
    description:
      'Wired manually here for now. In production this is fired automatically on reservation.checked_in.',
  })
  submit(@Body() dto: SubmitArrivalDto) {
    return this.svc.submit(dto as unknown as Parameters<typeof this.svc.submit>[0]);
  }

  @Post(':propertyId/cancel/:registrationId')
  @ApiOperation({ summary: 'Cancel a previously submitted guest arrival report' })
  cancel(
    @Param('propertyId') propertyId: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.svc.cancel(propertyId, registrationId);
  }
}
