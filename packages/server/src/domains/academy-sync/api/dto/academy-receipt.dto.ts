import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AcademyReceiptMethodDto {
  @ApiProperty({ description: "How the money was paid, in words a parent reads: Cash, M-Pesa, Bank transfer, ..." })
  label!: string;

  @ApiPropertyOptional({ nullable: true, type: String, description: "The M-Pesa code / bank reference, only where it belongs to the payer" })
  reference!: string | null;
}

export class AcademyReceiptAppliedDto {
  @ApiProperty({ description: "Where the money went: an invoice number, or advance payment" })
  label!: string;

  @ApiProperty({ type: String, description: "Decimal string, 4 places" })
  amount!: string;
}

export class AcademyReceiptViewDto {
  @ApiProperty({ format: "uuid", description: "Hand it back, with the learner it came with, to download the PDF" })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ description: "YYYY-MM-DD" })
  date!: string;

  @ApiProperty({ type: String, description: "Decimal string, 4 places" })
  amount!: string;

  @ApiProperty({ enum: ["KES"] })
  currency!: "KES";

  @ApiProperty({ enum: ["VALID", "REVERSED"], description: "REVERSED: the school has reversed it and it no longer counts as a payment" })
  status!: "VALID" | "REVERSED";

  @ApiProperty({ type: () => [AcademyReceiptMethodDto] })
  methods!: AcademyReceiptMethodDto[];

  @ApiProperty({ type: () => [AcademyReceiptAppliedDto] })
  appliedTo!: AcademyReceiptAppliedDto[];
}

export class AcademyReceiptListDto {
  @ApiProperty({ type: () => [AcademyReceiptViewDto], description: "The learner's receipts, newest first" })
  receipts!: AcademyReceiptViewDto[];
}
