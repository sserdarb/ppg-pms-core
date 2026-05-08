import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertInstapayConfigDto {
  @ApiProperty({ description: 'Whether Instapay is active for this property' })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ description: 'Merchant ID issued by the Instapay PSP' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  merchantId?: string;

  @ApiPropertyOptional({ description: 'Server-side API key — never expose to the storefront' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @ApiPropertyOptional({ enum: ['sandbox', 'live'] })
  @IsOptional()
  @IsEnum(['sandbox', 'live'])
  environment?: 'sandbox' | 'live';

  @ApiPropertyOptional({ description: 'Custom base URL — overrides default per-environment endpoint' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @ApiPropertyOptional({ description: 'Booking-engine return URL after the bank-app consent step' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  callbackUrl?: string;

  @ApiPropertyOptional({ description: 'Show Instapay as a payment option on the public booking engine' })
  @IsOptional()
  @IsBoolean()
  exposeOnBookingEngine?: boolean;
}
