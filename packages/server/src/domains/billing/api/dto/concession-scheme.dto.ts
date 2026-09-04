import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import {
  BILL_CONCESSION_CALCS,
  BILL_CONCESSION_KINDS,
  BillConcessionCalc,
  BillConcessionKind,
} from "../../domain/bill-concession-scheme.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateConcessionSchemeDto {
  @ApiProperty({ maxLength: 80 })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ enum: BILL_CONCESSION_KINDS })
  @IsIn(BILL_CONCESSION_KINDS)
  kind!: BillConcessionKind;

  @ApiProperty({ enum: BILL_CONCESSION_CALCS })
  @IsIn(BILL_CONCESSION_CALCS)
  calc!: BillConcessionCalc;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  value!: string;

  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  categoryScope?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowsStacking?: boolean;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  glAccountId!: string;
}

export class UpdateConcessionSchemeDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ enum: BILL_CONCESSION_KINDS })
  @IsOptional()
  @IsIn(BILL_CONCESSION_KINDS)
  kind?: BillConcessionKind;

  @ApiPropertyOptional({ enum: BILL_CONCESSION_CALCS })
  @IsOptional()
  @IsIn(BILL_CONCESSION_CALCS)
  calc?: BillConcessionCalc;

  @ApiPropertyOptional({ type: String, description: "Decimal string" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  value?: string;

  /**
   * `string[] | null` — genuinely nullable, not just optional. `null`
   * explicitly clears the scheme back to "any category"
   * (`ConcessionSchemesService.update()`'s own `changes.categoryScope !==
   * undefined` check already treats `null` this way; only `undefined`
   * means "leave the current scope untouched"). This DTO's own type
   * previously omitted `| null`, which — combined with the frontend never
   * sending a literal `null` out of caution — meant there was no way to
   * actually reach this already-working service-layer behavior through the
   * API: a real, confirmed "the DB/service supports it, the DTO's type
   * just never allowed asking for it" gap, not a validation rule that
   * needed changing (`@IsOptional()` already treats `null` the same as
   * `undefined` — skips the rest of this property's validators either
   * way — so no decorator change was needed, only the type).
   */
  @ApiPropertyOptional({ type: [String], nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  categoryScope?: string[] | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowsStacking?: boolean;

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  glAccountId?: string;
}

export class ConcessionSchemeResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: BILL_CONCESSION_KINDS })
  kind!: string;

  @ApiProperty({ enum: BILL_CONCESSION_CALCS })
  calc!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  value!: string;

  @ApiProperty({ type: [String], nullable: true })
  categoryScope!: string[] | null;

  @ApiProperty()
  allowsStacking!: boolean;

  @ApiProperty({ format: "uuid" })
  glAccountId!: string;

  @ApiProperty()
  isActive!: boolean;
}
