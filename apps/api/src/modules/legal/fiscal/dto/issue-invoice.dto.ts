import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsISO31661Alpha2,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

class FiscalLineDto {
  @IsString() description!: string;
  @IsOptional() quantity?: number;
  @IsString() unitNet!: string;
  @IsString() taxCode!: string;
  @IsString() taxRate!: string;
  @IsString() taxAmount!: string;
  @IsString() totalGross!: string;
}

class FiscalBuyerDto {
  @IsString() name!: string;
  @IsOptional() @IsString() taxId?: string;
  @IsISO31661Alpha2() countryCode!: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsEmail() email?: string;
}

export class IssueInvoiceDto {
  @IsUUID() propertyId!: string;
  @IsUUID() folioId!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => FiscalLineDto) lines!: FiscalLineDto[];
  @ValidateNested() @Type(() => FiscalBuyerDto) buyer!: FiscalBuyerDto;
  @IsOptional() @IsObject() extras?: Record<string, unknown>;
}
