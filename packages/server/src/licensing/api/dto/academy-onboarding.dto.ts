import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class StartAcademyOnboardingDto {
  @ApiProperty({ description: "Academy school code — case-insensitive, whitespace ignored" })
  @IsString()
  @MinLength(1)
  schoolCode!: string;
}

export class VerifyAcademyOnboardingDto {
  @ApiProperty()
  @IsString()
  schoolId!: string;

  @ApiProperty()
  @IsString()
  refId!: string;

  @ApiProperty({ description: "OTP delivered to the school administrator by email and SMS" })
  @IsString()
  @MinLength(1)
  code!: string;
}
