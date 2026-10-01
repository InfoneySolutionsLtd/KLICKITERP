import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";

export class CompleteFirstRunSetupDto {
  @ApiProperty({ description: "Display-only — the Academy school name, never persisted by this endpoint" })
  @IsString()
  schoolName!: string;

  @ApiProperty()
  @IsEmail()
  administratorEmail!: string;

  @ApiProperty()
  @IsString()
  administratorFirstName!: string;

  @ApiProperty()
  @IsString()
  administratorLastName!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @MinLength(10)
  password!: string;
}
