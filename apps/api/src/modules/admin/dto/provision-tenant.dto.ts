import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class TenantAdminUserDto {
  @IsString()
  ppgSubject!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsOptional()
  name?: string;
}

export class ProvisionTenantDto {
  /** External id from PPG master panel (e.g. "atrium-urla"). */
  @IsString()
  @Length(1, 100)
  ppgPropertyId!: string;

  @IsString()
  @Length(1, 255)
  name!: string;

  /** Short property code (HAIP property.code). Auto-generated from ppgPropertyId if omitted. */
  @IsString()
  @IsOptional()
  @Length(1, 20)
  code?: string;

  @IsISO31661Alpha2()
  countryCode!: string;

  @IsString()
  @Length(3, 3)
  currencyCode!: string;

  @IsString()
  timezone!: string;

  @IsString()
  @IsOptional()
  defaultLanguage?: string;

  @IsInt()
  @Min(1)
  totalRooms!: number;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  addressLine1?: string;

  /** Apply jurisdiction-default tax profile + rules. Default: true. */
  @IsBoolean()
  @IsOptional()
  applyDefaultTaxes?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantAdminUserDto)
  adminUser?: TenantAdminUserDto;
}

export class DeactivateTenantDto {
  @IsBoolean()
  active!: boolean;
}
