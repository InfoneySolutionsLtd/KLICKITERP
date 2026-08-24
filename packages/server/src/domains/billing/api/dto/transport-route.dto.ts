import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateTransportRouteDto {
  @ApiProperty({ maxLength: 60 })
  @IsString()
  @MaxLength(60)
  name!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiPropertyOptional({ maxLength: 80, nullable: true, description: "Free-text identifier for the vehicle serving this route (e.g. plate number)" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bus?: string;
}

export class UpdateTransportRouteDto {
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  amount?: string;

  @ApiPropertyOptional({ maxLength: 80, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bus?: string;
}

export class TransportRouteResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ nullable: true })
  bus!: string | null;

  @ApiProperty()
  isActive!: boolean;
}
