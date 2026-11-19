import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

const STEP_KEYS = ["CONNECT", "IMPORT_STUDENTS", "REACH_ERP", "PUBLISH_INVOICES", "RECEIPTS", "PAYMENTS", "FEE_OPTIONS", "PARENT_INVOICING"];

export class AcademySetupStepDto {
  @ApiProperty({ enum: STEP_KEYS })
  key!: string;

  @ApiProperty({ enum: ["SHOW_INVOICES", "RECEIPTS_AND_PAYMENTS", "PARENT_INVOICES"], description: "Which part of the journey the step belongs to" })
  group!: string;

  @ApiProperty({ description: "Optional steps are never needed to show invoices to parents" })
  optional!: boolean;

  @ApiProperty({
    enum: ["DONE", "TODO", "ATTENTION", "LOCKED"],
    description: "TODO = not started; ATTENTION = started but something is wrong; LOCKED = a step it needs is not done yet",
  })
  state!: string;

  @ApiProperty({ enum: STEP_KEYS, isArray: true, description: "The steps that must be done first and are not (only when LOCKED)" })
  blockedBy!: string[];

  @ApiProperty({ type: String, nullable: true, description: "A short code saying why the step is in this state (turned into words by the web app)" })
  detail!: string | null;
}

export class AcademySetupCashierDto {
  @ApiProperty({ description: "True when a user is set AND is active" })
  configured!: boolean;

  @ApiProperty({ type: String, format: "uuid", nullable: true })
  userId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  userName!: string | null;

  @ApiProperty({ description: "False when a user id is saved but that user is missing or not active" })
  userActive!: boolean;
}

export class AcademySetupPaymentsDto {
  @ApiProperty({ description: "A real M-Pesa provider is set up (not the log-only fallback that sends nothing)" })
  providerConfigured!: boolean;

  @ApiProperty({ type: AcademySetupCashierDto, description: "The user receipts of parent M-Pesa payments are recorded under" })
  cashier!: AcademySetupCashierDto;
}

export class AcademySetupGuideDto {
  @ApiProperty({ type: [AcademySetupStepDto], description: "Every step, in the order a person should do them" })
  steps!: AcademySetupStepDto[];

  @ApiProperty()
  doneCount!: number;

  @ApiProperty()
  totalCount!: number;

  @ApiProperty({ description: "Done steps among the ones needed to show invoices to parents" })
  requiredDone!: number;

  @ApiProperty()
  requiredTotal!: number;

  @ApiProperty({ type: String, enum: STEP_KEYS, nullable: true, description: "The first step to do or fix (never a locked one); null when everything is done" })
  nextStepKey!: string | null;

  @ApiProperty({ type: AcademySetupPaymentsDto })
  payments!: AcademySetupPaymentsDto;
}

export class SetPaymentsCashierDto {
  @ApiProperty({ format: "uuid", description: "The ACTIVE user receipts of parent M-Pesa payments are recorded under (ideally a service account)" })
  @IsUUID()
  userId!: string;
}
