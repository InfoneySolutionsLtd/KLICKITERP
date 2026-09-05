import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";
import { BANK_EXTERNAL_TRANSFER_STATUSES } from "../../domain/bank-external-transfer.entity";
import { DECIMAL_PATTERN } from "./decimal.util";

export class CreateBankExternalTransferDto {
  @ApiProperty({ format: "uuid", description: "The school's own bank account money leaves from" })
  @IsUUID()
  sourceAccountId!: string;

  @ApiProperty({ description: "The real named external beneficiary — a vendor, a refund recipient, any named party" })
  @IsString()
  @MaxLength(120)
  beneficiaryName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  beneficiaryBankName!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  beneficiaryBranch?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  beneficiaryAccountNo!: string;

  @ApiProperty({ format: "uuid", description: "The GL account this payment is for (an EXPENSE-class account, picked by the creator)" })
  @IsUUID()
  debitAccountId!: string;

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

export class UpdateBankExternalTransferReferenceDto {
  @ApiProperty({ description: "The bank's own transaction reference for this transfer" })
  @IsString()
  @MaxLength(60)
  referenceNo!: string;
}

export class BankExternalTransferResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ format: "uuid" })
  sourceAccountId!: string;

  @ApiProperty()
  beneficiaryName!: string;

  @ApiProperty()
  beneficiaryBankName!: string;

  @ApiProperty({ nullable: true })
  beneficiaryBranch!: string | null;

  @ApiProperty()
  beneficiaryAccountNo!: string;

  @ApiProperty({ format: "uuid" })
  debitAccountId!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ enum: BANK_EXTERNAL_TRANSFER_STATUSES })
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
