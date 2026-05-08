import { Type } from 'class-transformer';
import {
  IsDateString,
  IsISO31661Alpha2,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

class GuestDto {
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsISO31661Alpha2() nationality!: string;
  @IsString() idType!: string;
  @IsString() idNumber!: string;
  @IsISO31661Alpha2() idCountry!: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() gender?: string;
}

class ArrivalDto {
  @IsDateString() checkInAt!: string;
  @IsDateString() checkOutPlannedAt!: string;
  @IsOptional() @IsString() roomNumber?: string;
}

export class SubmitArrivalDto {
  @IsUUID() propertyId!: string;
  @IsUUID() reservationId!: string;
  @ValidateNested() @Type(() => GuestDto) guest!: GuestDto;
  @ValidateNested() @Type(() => ArrivalDto) arrival!: ArrivalDto;
  @IsOptional() @IsObject() extras?: Record<string, unknown>;
}
