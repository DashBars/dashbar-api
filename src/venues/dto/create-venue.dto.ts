import { IsInt, IsNotEmpty, IsOptional, IsString, Min, IsEnum, IsNumber } from 'class-validator';
import { VenueType } from '@prisma/client';

export class CreateVenueDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsOptional()
  @IsEnum(VenueType)
  venueType?: VenueType;

  // Google Places API fields
  @IsOptional()
  @IsString()
  placeId?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  formattedAddress?: string;
}
