import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

export class SetAcademyPublishDto {
  @ApiProperty({ description: "Whether invoices are published to the Academy parent portal" })
  @IsBoolean()
  enabled!: boolean;
}

export class AcademyPublishRejectionDto {
  @ApiProperty()
  invoiceNumber!: string;

  @ApiProperty({ description: "Why the Academy did not accept this invoice" })
  reason!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  at!: string | null;
}

export class AcademyReceiptSetupDto {
  @ApiProperty({ description: "Receipts can be issued as PDFs: the school has set up at least a logo or letterhead text, so every receipt names its school" })
  canIssue!: boolean;

  @ApiProperty({ description: "Everything is in place: logo, letterhead text and a public address for the QR code" })
  complete!: boolean;

  @ApiProperty({
    enum: ["NO_LOGO", "NO_LETTERHEAD", "QR_ADDRESS_NOT_PUBLIC"],
    isArray: true,
    description: "What is still to set up: the logo and letterhead text (Branding -> Documents), a public WEB_APP_URL for the QR code",
  })
  issues!: Array<"NO_LOGO" | "NO_LETTERHEAD" | "QR_ADDRESS_NOT_PUBLIC">;
}

export class AcademyPublishStatusDto {
  @ApiProperty({ description: "Whether this ERP is connected to its Academy school" })
  connected!: boolean;

  @ApiProperty({ description: "Whether invoices are being published to the parent portal (off until an admin switches it on)" })
  enabled!: boolean;

  @ApiProperty({ description: "Invoices of linked students that the portal does not have in their current state yet" })
  pending!: number;

  @ApiProperty({ description: "Invoices the portal holds in their current state" })
  published!: number;

  @ApiProperty({ description: "Invoices the Academy refused (see recentRejections)" })
  rejected!: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  lastPublishAt!: string | null;

  @ApiPropertyOptional({ nullable: true, type: Boolean })
  lastPublishOk!: boolean | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  lastPublishMessage!: string | null;

  @ApiProperty({ type: () => [AcademyPublishRejectionDto] })
  recentRejections!: AcademyPublishRejectionDto[];

  @ApiPropertyOptional({ type: () => AcademyReceiptSetupDto, nullable: true, description: "Whether this school's receipts carry its logo, letterhead and a QR code; null when it could not be checked" })
  receiptSetup!: AcademyReceiptSetupDto | null;
}
