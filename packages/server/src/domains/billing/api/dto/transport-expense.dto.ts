import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsObject, IsString, Matches } from "class-validator";
import { EXP_VOUCHER_METHODS, EXP_VOUCHER_PAYEE_TYPES } from "../../../expenses";
import { DECIMAL_PATTERN } from "./decimal.util";

export class LogTransportExpenseDto {
  @ApiProperty({ enum: EXP_VOUCHER_PAYEE_TYPES })
  @IsIn(EXP_VOUCHER_PAYEE_TYPES)
  payeeType!: "SUPPLIER" | "STAFF" | "OTHER";

  @ApiProperty({ type: Object, description: "Polymorphic payee identity, shape depends on payeeType" })
  @IsObject()
  payeeRef!: Record<string, unknown>;

  @ApiProperty({ type: String, description: "Decimal string" })
  @Matches(DECIMAL_PATTERN)
  amount!: string;

  @ApiProperty({ enum: EXP_VOUCHER_METHODS })
  @IsIn(EXP_VOUCHER_METHODS)
  method!: "CASH" | "BANK" | "PETTY_CASH" | "MPESA" | "CHEQUE";

  @ApiProperty()
  @IsString()
  narrative!: string;
}

export class TransportExpenseResponseDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ format: "uuid" })
  routeId!: string;

  @ApiProperty({ format: "uuid" })
  voucherId!: string;

  @ApiProperty()
  voucherNumber!: string;

  @ApiProperty({ type: String, description: "Decimal string" })
  amount!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  narrative!: string;

  @ApiProperty({ format: "date-time" })
  createdAt!: string;
}

export class TransportRouteSummaryDto {
  @ApiProperty({ format: "uuid" })
  routeId!: string;

  @ApiProperty({ type: String, description: "Decimal string — sum of all transport fee invoice lines billed for this route" })
  totalIncome!: string;

  @ApiProperty({ type: String, description: "Decimal string — sum of all voucher amounts logged as expenses against this route" })
  totalExpense!: string;
}
