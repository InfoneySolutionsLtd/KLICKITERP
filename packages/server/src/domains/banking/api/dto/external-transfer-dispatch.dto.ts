import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";
import { BANK_DISPATCH_STATUSES, BankDispatchStatus } from "../../domain/bank-external-transfer-dispatch.entity";

export class DispatchExternalTransferDto {
  @ApiPropertyOptional({ description: "KCB transactionType (2 characters). Defaults to the KCB integration's setting (KCB's own example: IF)." })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  transactionType?: string;

  @ApiPropertyOptional({ description: "KCB beneficiaryBankCode — only when the beneficiary banks elsewhere" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  beneficiaryBankCode?: string;
}

export class ResolveDispatchDto {
  @ApiProperty({ enum: ["SENT", "FAILED"], description: "SENT = the bank did pay; FAILED = it did not (a new attempt is then allowed)" })
  @IsIn(["SENT", "FAILED"])
  outcome!: "SENT" | "FAILED";

  @ApiProperty({ description: "What you found out and how — required" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note!: string;

  @ApiPropertyOptional({ description: "The bank's own transaction id, if you have it" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  bankRef?: string;
}

export class BankExternalTransferDispatchResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  transferId!: string;

  @ApiProperty({ example: "KCB" })
  provider!: string;

  @ApiProperty({ description: "The 12-character reference given to the bank — quote it when asking the bank about this payment" })
  reference!: string;

  @ApiProperty({ enum: BANK_DISPATCH_STATUSES })
  status!: BankDispatchStatus;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty({ type: String, nullable: true, description: "The bank's own transaction id" })
  bankRef!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Why it failed, what is unknown, or how it was resolved" })
  note!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}
