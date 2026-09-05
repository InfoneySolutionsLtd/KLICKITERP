import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsUUID } from "class-validator";

export class BillTransportRouteDto {
  @ApiProperty({ format: "uuid" })
  @IsUUID()
  routeId!: string;

  @ApiProperty({ format: "uuid" })
  @IsUUID()
  termId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  studentIds!: string[];

  @ApiPropertyOptional({ type: String, format: "date", description: "Defaults to today" })
  @IsOptional()
  @IsDateString()
  issueDate?: string;
}

export class BillTransportSuccessDto {
  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ type: [String] })
  invoiceIds!: string[];
}

export class BillTransportFailureDto {
  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty()
  error!: string;
}

export class BillTransportResultDto {
  @ApiProperty({ type: [BillTransportSuccessDto] })
  succeeded!: BillTransportSuccessDto[];

  @ApiProperty({ type: [BillTransportFailureDto] })
  failed!: BillTransportFailureDto[];
}

export class RegenerateTransportBillingDto {
  @ApiProperty({ format: "uuid", description: "The TARGET term to regenerate transport billing into" })
  @IsUUID()
  termId!: string;

  @ApiPropertyOptional({ format: "uuid", description: "Narrow to students who rode this route in the preceding term" })
  @IsOptional()
  @IsUUID()
  routeId?: string;
}

export class TransportRegenerateSuccessDto {
  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ type: [String] })
  invoiceIds!: string[];

  @ApiProperty({ format: "uuid" })
  routeId!: string;
}

export class TransportRegenerateSkipDto {
  @ApiProperty({ format: "uuid" })
  studentId!: string;

  @ApiProperty({ description: "Why nothing was generated for this student (not an error)" })
  reason!: string;
}

export class TransportRegenerateResultDto {
  @ApiProperty({ type: [TransportRegenerateSuccessDto] })
  succeeded!: TransportRegenerateSuccessDto[];

  @ApiProperty({ type: [BillTransportFailureDto] })
  failed!: BillTransportFailureDto[];

  @ApiProperty({ type: [TransportRegenerateSkipDto] })
  skipped!: TransportRegenerateSkipDto[];
}
