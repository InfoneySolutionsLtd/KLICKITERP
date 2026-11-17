import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional } from "class-validator";
import {
  ACAD_SYNC_MODES,
  ACAD_SYNC_SCOPES,
  ACAD_SYNC_STATUSES,
  ACAD_SYNC_TRIGGERS,
  AcadSyncMode,
  AcadSyncScope,
  AcadSyncStatus,
  AcadSyncTrigger,
} from "../../domain/acad-sync-run.entity";

export class StartAcademySyncRunDto {
  @ApiProperty({ enum: ACAD_SYNC_MODES, description: "PREVIEW only reports what an import would do; IMPORT applies it" })
  @IsIn(ACAD_SYNC_MODES as unknown as string[])
  mode!: AcadSyncMode;

  @ApiPropertyOptional({
    enum: ACAD_SYNC_SCOPES,
    description: "FULL reads every student; INCREMENTAL only those changed since the last import. The first preview/import is always FULL.",
  })
  @IsOptional()
  @IsIn(ACAD_SYNC_SCOPES as unknown as string[])
  scope?: AcadSyncScope;

  @ApiPropertyOptional({ description: "Required once, for the first IMPORT: confirms the preview has been reviewed" })
  @IsOptional()
  @IsBoolean()
  confirmFirstImport?: boolean;
}

export class SetAcademyAutoSyncDto {
  @ApiProperty()
  @IsBoolean()
  autoSyncEnabled!: boolean;
}

export class AcademySyncIssueDto {
  @ApiProperty({ example: "NO_ADMISSION_NUMBER" })
  code!: string;

  @ApiProperty()
  message!: string;

  @ApiPropertyOptional()
  academyStudentId?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  admissionNo?: string | null;

  @ApiPropertyOptional()
  studentName?: string;
}

export class AcademySyncRunDto {
  @ApiProperty({ format: "uuid" })
  id!: string;

  @ApiProperty({ enum: ACAD_SYNC_MODES })
  mode!: AcadSyncMode;

  @ApiProperty({ enum: ACAD_SYNC_SCOPES })
  scope!: AcadSyncScope;

  @ApiProperty({ enum: ACAD_SYNC_TRIGGERS })
  trigger!: AcadSyncTrigger;

  @ApiProperty({ enum: ACAD_SYNC_STATUSES })
  status!: AcadSyncStatus;

  @ApiProperty()
  startedAt!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  finishedAt!: string | null;

  @ApiProperty({ type: "object", additionalProperties: { type: "number" }, description: "seen, created, linked, updated, unchanged, skipped, ..." })
  counts!: Record<string, number>;

  @ApiProperty({ type: () => [AcademySyncIssueDto], description: "At most 500; issuesTotal is the true count" })
  issues!: AcademySyncIssueDto[];

  @ApiProperty()
  issuesTotal!: number;

  @ApiPropertyOptional({ nullable: true, type: String, description: "Set when the run itself failed" })
  error!: string | null;
}

export class AcademySyncStatusDto {
  @ApiProperty({ description: "Whether this ERP has completed Academy onboarding (school code + OTP)" })
  connected!: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  academySchoolCode!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  firstImportConfirmedAt!: string | null;

  @ApiProperty()
  autoSyncEnabled!: boolean;

  @ApiPropertyOptional({ nullable: true, type: String })
  lastSuccessAt!: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  lastFullSuccessAt!: string | null;

  @ApiProperty({ description: "Academy students currently linked to an ERP student" })
  mappedStudents!: number;

  @ApiPropertyOptional({ type: () => AcademySyncRunDto, nullable: true })
  runningRun!: AcademySyncRunDto | null;

  @ApiPropertyOptional({ type: () => AcademySyncRunDto, nullable: true })
  lastPreview!: AcademySyncRunDto | null;

  @ApiPropertyOptional({ type: () => AcademySyncRunDto, nullable: true })
  lastImport!: AcademySyncRunDto | null;
}
