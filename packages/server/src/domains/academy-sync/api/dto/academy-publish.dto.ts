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
}
