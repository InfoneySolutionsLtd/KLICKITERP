import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator";

/** The most invoices one payment can be directed at. */
export const MAX_INVOICES_PER_PAYMENT = 50;

export class CreateAcademyPaymentRequestDto {
  @ApiProperty({ format: "uuid", description: "The Academy's own id for this request. Sending the same id again never sends a second M-Pesa prompt." })
  @IsUUID()
  requestId!: string;

  @ApiProperty({ description: "The Academy's id of the learner being paid for (the one the ERP linked during student sync)" })
  @IsString()
  @MaxLength(64)
  academyStudentId!: string;

  @ApiProperty({ type: String, description: "Whole shillings, as a decimal string (e.g. \"2500\" or \"2500.00\")" })
  @Matches(/^\d{1,9}(\.0{1,4})?$/, { message: "amount must be a whole number of shillings" })
  amount!: string;

  @ApiProperty({ description: "The parent's M-Pesa number, any common Kenyan format (0712345678, +254712345678, ...)" })
  @IsString()
  @MaxLength(20)
  phone!: string;

  @ApiPropertyOptional({
    type: [String],
    description: "ERP invoice ids (as published to the portal) to pay toward. Omitted: the learner's open invoices, oldest first.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_INVOICES_PER_PAYMENT)
  @IsUUID("all", { each: true })
  invoiceIds?: string[];
}

export class AcademyPaymentRequestViewDto {
  @ApiProperty({ format: "uuid" })
  requestId!: string;

  @ApiProperty({ enum: ["PENDING", "PAID", "FAILED", "TIMED_OUT"], description: "How the payment is going, read from the school's books every time" })
  status!: "PENDING" | "PAID" | "FAILED" | "TIMED_OUT";

  @ApiProperty({ type: String, description: "Decimal string, 4 places" })
  amount!: string;

  @ApiProperty({ enum: ["KES"] })
  currency!: "KES";

  @ApiPropertyOptional({ nullable: true, type: String, description: "The ERP receipt number, once the payment is received" })
  receiptNumber!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: "Short machine code for a refusal or failure" })
  code!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: "Plain wording that is safe to show a parent" })
  message!: string | null;
}
