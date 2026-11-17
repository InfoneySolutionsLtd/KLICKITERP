import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { PaginationQueryDto } from "../../../../shared/pagination/pagination.dto";
import { PAY_BANK_IPN_KINDS, PAY_BANK_IPN_STATES, PayBankIpnKind, PayBankIpnState } from "../../domain/pay-bank-ipn.entity";

export class BankIpnListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PAY_BANK_IPN_STATES })
  @IsOptional()
  @IsIn(PAY_BANK_IPN_STATES as unknown as string[])
  state?: PayBankIpnState;

  @ApiPropertyOptional({ enum: PAY_BANK_IPN_KINDS })
  @IsOptional()
  @IsIn(PAY_BANK_IPN_KINDS as unknown as string[])
  kind?: PayBankIpnKind;

  @ApiPropertyOptional({ description: "Matches the bank reference, the payer's reference, or the payer's name" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class BankIpnResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ example: "KCB" })
  provider!: string;

  @ApiProperty({ enum: PAY_BANK_IPN_KINDS })
  kind!: PayBankIpnKind;

  @ApiProperty({ description: "The bank's own transaction id" })
  externalRef!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty()
  currency!: string;

  @ApiProperty({ type: String, nullable: true, description: "What the payer typed — normally the admission number" })
  customerReference!: string | null;

  @ApiProperty({ type: String, nullable: true })
  payerName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  payerMsisdnMasked!: string | null;

  @ApiProperty({ type: String, nullable: true })
  narration!: string | null;

  @ApiProperty({ type: String, nullable: true })
  creditAccount!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  transactionAt!: string;

  @ApiProperty({ enum: PAY_BANK_IPN_STATES })
  state!: PayBankIpnState;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  receiptId!: string | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  suspenseItemId!: string | null;

  @ApiProperty({ type: String, nullable: true, description: "Why it is waiting in suspense" })
  note!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}

export class BankIpnListResponseDto {
  @ApiProperty({ type: [BankIpnResponseDto] })
  items!: BankIpnResponseDto[];

  @ApiProperty()
  total!: number;
}

export class BankIpnCashierStatusDto {
  @ApiProperty({ description: "True when a receipting cashier is set AND is an active user" })
  configured!: boolean;

  @ApiProperty({ enum: ["BANK", "MPESA"], nullable: true, type: String, description: "Which setting supplied it (the M-Pesa one is the fallback)" })
  source!: "BANK" | "MPESA" | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  userId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  userName!: string | null;

  @ApiProperty({ description: "False when a user id is saved but that user is missing or not active" })
  userActive!: boolean;
}

export class BankIpnReadinessResponseDto {
  @ApiProperty({ type: BankIpnCashierStatusDto })
  cashier!: BankIpnCashierStatusDto;
}

export class SetBankIpnCashierDto {
  @ApiProperty({ format: "uuid", description: "The active user recorded as the cashier on receipts made from bank notifications" })
  @IsUUID()
  userId!: string;
}
