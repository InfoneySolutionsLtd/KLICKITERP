import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { BANK_TRANSFER_STATUSES } from "../../domain/bank-transfer.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateBankTransferDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  fromAccountId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  toAccountId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiPropertyOptional({ type: String, description: "Decimal string — a transfer fee, if the bank charges one" })
  @IsOptional()
  @Matches(DECIMAL_PATTERN)
  feeAmount?: string;

  @ApiPropertyOptional({ description: "The bank's own transaction reference, if already known" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  referenceNo?: string;

  @ApiPropertyOptional({ type: String, format: "date", description: "ISO date string (YYYY-MM-DD) — informational only" })
  @IsOptional()
  @IsDateString()
  expectedClearingDate?: string;
}

export class UpdateBankTransferReferenceDto {
  @ApiProperty({ description: "The bank's own transaction reference for this transfer" })
  @IsString()
  @MaxLength(60)
  referenceNo!: string;
}

export class BankTransferResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  fromAccountId!: string;

  @ApiProperty({ format: "uuid" })
  toAccountId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ enum: BANK_TRANSFER_STATUSES })
  status!: string;

  @ApiProperty({ format: "uuid", nullable: true })
  approvalRef!: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  journalId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Decimal string" })
  feeAmount!: string | null;

  @ApiProperty({ nullable: true })
  referenceNo!: string | null;

  @ApiProperty({ type: String, format: "date", nullable: true })
  expectedClearingDate!: string | null;
}
