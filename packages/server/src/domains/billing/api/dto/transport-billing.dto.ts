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
