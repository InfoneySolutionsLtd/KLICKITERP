import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class RegisterAcademyLinkDto {
  @ApiProperty({
    description:
      "The public address of this ERP's API, as the internet sees it — e.g. https://erp.yourschool.ac.ke/api/v1. The Academy calls <this>/academy/inbound/...",
    example: "https://erp.yourschool.ac.ke/api/v1",
  })
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  erpBaseUrl!: string;
}

export class AcademyLinkStatusDto {
  @ApiProperty({ description: "Whether this ERP has completed Academy onboarding (school code + OTP)" })
  connected!: boolean;

  @ApiProperty({ description: "Whether this ERP has told the Academy where to call it" })
  registered!: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  registeredBaseUrl!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  registeredAt!: string | null;

  @ApiPropertyOptional({ nullable: true, type: Number, description: "Bumps each time the address is registered again (the secret is replaced)" })
  secretVersion!: number | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  lastVerifiedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, type: Boolean })
  lastVerifyOk!: boolean | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  lastVerifyMessage!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: "The last time a correctly signed call from the Academy arrived" })
  lastInboundAt!: string | null;

  @ApiProperty({ description: "A starting point for the address field; the admin confirms it" })
  suggestedBaseUrl!: string;
}
