import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

/** The most optional items one request can pick (a fee structure never has anywhere near this many). */
export const MAX_OPTIONAL_ITEMS_PER_REQUEST = 50;

export class CreateAcademyParentInvoiceRequestDto {
  @ApiProperty({ format: "uuid", description: "The Academy's own id for this request. Sending the same id again never creates a second invoice." })
  @IsUUID()
  requestId!: string;

  @ApiProperty({ format: "uuid", description: "The term to invoice (one the fee options offered)" })
  @IsUUID()
  termId!: string;

  @ApiProperty({
    type: [String],
    description: "Fee category ids of the OPTIONAL items the parent ticked. Only ids: every amount comes from the school's fee structure.",
  })
  @IsArray()
  @ArrayMaxSize(MAX_OPTIONAL_ITEMS_PER_REQUEST)
  @IsUUID("all", { each: true })
  optionalCategoryIds!: string[];

  @ApiPropertyOptional({ nullable: true, format: "uuid", description: "The transport route the parent picked, if any" })
  @IsOptional()
  @IsUUID()
  routeId?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: "The signed-in parent's name as the Academy verified it. Shown to accounts staff in the notification." })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  parentName?: string | null;
}

export class AcademyFeeOptionLineDto {
  @ApiProperty({ format: "uuid" })
  categoryId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, description: "Decimal string, 4 places — the school's own amount" })
  amount!: string;

  @ApiProperty({ type: String, description: "YYYY-MM-DD" })
  dueDate!: string;
}

export class AcademyTransportRouteDto {
  @ApiProperty({ format: "uuid" })
  routeId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, description: "Decimal string, 4 places — the route's flat fare for the term" })
  amount!: string;
}

export class AcademyTermFeeOptionsDto {
  @ApiProperty({ format: "uuid" })
  termId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isCurrent!: boolean;

  @ApiProperty({ type: String, description: "YYYY-MM-DD" })
  startsOn!: string;

  @ApiProperty({ type: String, description: "YYYY-MM-DD" })
  endsOn!: string;

  @ApiProperty({
    enum: ["FULL", "TOP_UP"],
    description:
      "FULL: nothing of this term is billed yet, so the parent's invoice is the whole fee invoice. TOP_UP: the school already billed the term; the parent can only add optional items and/or transport.",
  })
  mode!: "FULL" | "TOP_UP";

  @ApiProperty({ type: [AcademyFeeOptionLineDto], description: "FULL only: lines the invoice carries whatever is chosen (read-only)" })
  included!: AcademyFeeOptionLineDto[];

  @ApiProperty({ type: [AcademyFeeOptionLineDto], description: "Optional items the parent may tick" })
  optional!: AcademyFeeOptionLineDto[];

  @ApiProperty({ type: [AcademyTransportRouteDto], description: "Routes the parent may pick; empty when transport is already billed for the term" })
  transportRoutes!: AcademyTransportRouteDto[];

  @ApiProperty()
  transportAlreadyBilled!: boolean;
}

export class AcademyParentFeeOptionsDto {
  @ApiProperty({ description: "False when the school has not switched this on or has not finished setting it up" })
  available!: boolean;

  @ApiPropertyOptional({ nullable: true, type: String, description: "Plain wording safe to show a parent when not available" })
  message!: string | null;

  @ApiProperty({ type: [AcademyTermFeeOptionsDto] })
  terms!: AcademyTermFeeOptionsDto[];
}

export class AcademyParentInvoiceDto {
  @ApiProperty({ format: "uuid" })
  invoiceId!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ enum: ["FEE", "TRANSPORT"] })
  kind!: "FEE" | "TRANSPORT";

  @ApiProperty({ type: String, description: "Decimal string, 4 places, after any concession applied when posting" })
  total!: string;

  @ApiProperty({ type: String, description: "YYYY-MM-DD" })
  dueDate!: string;
}

export class AcademyParentInvoiceRequestViewDto {
  @ApiProperty({ format: "uuid" })
  requestId!: string;

  @ApiProperty({ enum: ["CREATED", "REFUSED", "PENDING"] })
  status!: "CREATED" | "REFUSED" | "PENDING";

  @ApiPropertyOptional({ nullable: true, type: String, description: "Short machine code for a refusal" })
  code!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, description: "Plain wording that is safe to show a parent" })
  message!: string | null;

  @ApiPropertyOptional({ nullable: true, enum: ["FULL", "TOP_UP"] })
  mode!: "FULL" | "TOP_UP" | null;

  @ApiProperty({ type: [AcademyParentInvoiceDto] })
  invoices!: AcademyParentInvoiceDto[];

  @ApiProperty({ type: String, description: "Sum of the invoices' totals, decimal string, 4 places" })
  total!: string;
}

/** Which user invoices a parent generates are recorded under, and where that came from. */
export class AcademyParentInvoiceActorDto {
  @ApiProperty({ description: "True when a user is set AND is active: parent invoices can be created" })
  configured!: boolean;

  @ApiProperty({
    enum: ["PARENT_INVOICES", "MPESA"],
    nullable: true,
    type: String,
    description: "Which setting supplied it: this feature's own, or the existing M-Pesa system cashier (the fallback)",
  })
  source!: "PARENT_INVOICES" | "MPESA" | null;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  userId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  userName!: string | null;

  @ApiProperty({ description: "False when a user id is saved but that user is missing or not active" })
  userActive!: boolean;
}

/** Staff side: the school's switch for parent invoicing. */
export class AcademyParentInvoicingStatusDto {
  @ApiProperty({ description: "Parents may customise and generate their own fee invoices from the parent portal" })
  enabled!: boolean;

  @ApiProperty({ description: "Publishing invoices to the parent portal is on (parents only see what is published)" })
  publishingOn!: boolean;

  @ApiProperty({ type: [String], format: "uuid", description: "Roles told when a parent generates an invoice. Empty: everyone who can post invoices." })
  notifyRoleIds!: string[];

  @ApiProperty({ type: AcademyParentInvoiceActorDto, description: "The user parent-generated invoices are recorded under" })
  actor!: AcademyParentInvoiceActorDto;

  @ApiProperty({ enum: ["NOT_CONNECTED", "PUBLISHING_OFF", "NO_SYSTEM_USER"], isArray: true })
  issues!: Array<"NOT_CONNECTED" | "PUBLISHING_OFF" | "NO_SYSTEM_USER">;
}

export class SetAcademyParentInvoicingDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ type: [String], format: "uuid", description: "Omit to leave the notification roles as they are; [] = everyone who can post invoices" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("all", { each: true })
  notifyRoleIds?: string[];

  @ApiPropertyOptional({
    format: "uuid",
    description: "The ACTIVE user parent-generated invoices are recorded under (ideally a service account). Omit to leave it as it is.",
  })
  @IsOptional()
  @IsUUID()
  actorUserId?: string;
}
