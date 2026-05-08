import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { ServiceTokenGuard } from '../admin/service-token.guard';
import { PropertyPaymentSettingsService } from './property-payment-settings.service';
import { UpsertInstapayConfigDto } from './dto/instapay-config.dto';

@ApiTags('payments')
@Controller('properties/:propertyId/payment-settings')
export class PropertyPaymentSettingsController {
  constructor(
    private readonly settingsService: PropertyPaymentSettingsService,
  ) {}

  @Get()
  @UseGuards(ServiceTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all configured payment providers for a property (PPG control-plane)',
    description:
      'Returns merchant credentials — redacted API keys. Requires PPG_SERVICE_TOKEN.',
  })
  @ApiResponse({ status: 200 })
  getProviders(@Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.settingsService.getProviders(propertyId);
  }

  @Put('instapay')
  @UseGuards(ServiceTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Configure Instapay for a property (PPG control-plane)' })
  @ApiResponse({ status: 200, description: 'Instapay configuration saved' })
  upsertInstapay(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: UpsertInstapayConfigDto,
  ) {
    return this.settingsService.upsertInstapayConfig(propertyId, dto);
  }

  @Put(':provider')
  @UseGuards(ServiceTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Configure any payment provider (iyzico, paytr, isbank, denizbank, yapikredi)',
    description: 'Generic endpoint for configuring payment providers. Secret fields (apiKey, secretKey, storeKey, etc.) are auto-encrypted.',
  })
  @ApiResponse({ status: 200, description: 'Provider configuration saved' })
  upsertProvider(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('provider') provider: string,
    @Body() dto: any,
  ) {
    const secretFieldsMap: Record<string, string[]> = {
      iyzico: ['apiKey', 'secretKey'],
      paytr: ['secretKey', 'merchantSalt'],
      isbank: ['storeKey', 'apiPassword'],
      denizbank: ['storeKey', 'apiPassword'],
      yapikredi: ['storeKey', 'apiPassword'],
    };
    const secretFields = secretFieldsMap[provider] || [];
    return this.settingsService.upsertProviderConfig(propertyId, provider as any, dto, secretFields);
  }

  @Public()
  @Get('public')
  @ApiOperation({
    summary: 'Public list of payment providers exposed on the booking engine',
    description:
      'Storefront-safe view: no API keys, only the providers flagged with exposeOnBookingEngine.',
  })
  @ApiResponse({ status: 200 })
  getPublicProviders(@Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.settingsService.getPublicProviders(propertyId);
  }
}
