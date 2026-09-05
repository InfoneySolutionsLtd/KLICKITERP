import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsOptional, IsUUID } from "class-validator";

export class BulkGenerateDto {
  @ApiProperty({ format: "uuid", description: "The TARGET term to generate invoices into" })
  @IsUUID()
  termId!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  classIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  streamIds?: string[];
}

export class BulkGenerateSuccessDto {
  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ type: [String], format: "uuid" })
  invoiceIds!: string[];

  @ApiProperty({ type: [String], format: "uuid", description: "The carried-forward fee categories actually billed" })
  categoryIds!: string[];

  @ApiPropertyOptional({
    type: [String],
    format: "uuid",
    description: "Set only on a PARTIAL skip — carried-forward categories this student already had a real invoice line for this term, so they were left out",
  })
  alreadyBilledCategoryIds?: string[];
}

export class BulkGenerateFailureDto {
  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty()
  error!: string;
}

export class BulkGenerateSkipDto {
  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ description: "Why nothing was generated for this student (not an error)" })
  reason!: string;
}

export class BulkGenerateResultDto {
  @ApiProperty({ type: [BulkGenerateSuccessDto] })
  succeeded!: BulkGenerateSuccessDto[];

  @ApiProperty({ type: [BulkGenerateFailureDto] })
  failed!: BulkGenerateFailureDto[];

  @ApiProperty({ type: [BulkGenerateSkipDto] })
  skipped!: BulkGenerateSkipDto[];
}
