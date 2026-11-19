import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsUUID } from "class-validator";
import { NOTIFICATION_CATEGORIES } from "../../domain/notification-catalogue";

const CATEGORY_CODES = NOTIFICATION_CATEGORIES.map((category) => category.code);

// ---- the person's own preferences -----------------------------------------------------------------------------------

export class NotificationPreferenceDto {
  @ApiProperty({ enum: CATEGORY_CODES })
  category!: string;

  @ApiProperty({ description: "Approvals and security: always delivered, so they cannot be switched off" })
  essential!: boolean;

  @ApiProperty()
  isEnabled!: boolean;
}

export class NotificationPreferencesResponseDto {
  @ApiProperty({ type: [NotificationPreferenceDto] })
  items!: NotificationPreferenceDto[];
}

export class UpdateNotificationPreferenceDto {
  @ApiProperty({ enum: CATEGORY_CODES })
  @IsIn(CATEGORY_CODES)
  category!: string;

  @ApiProperty()
  @IsBoolean()
  isEnabled!: boolean;
}

// ---- the school's settings per event --------------------------------------------------------------------------------

export class NotificationEventSettingDto {
  @ApiProperty({ maxLength: 60, description: "The event's code, e.g. CHEQUE_BOUNCED" })
  code!: string;

  @ApiProperty({ enum: CATEGORY_CODES })
  category!: string;

  @ApiProperty({ description: "The category cannot be switched off by an individual (approvals, security)" })
  essentialCategory!: boolean;

  @ApiProperty({ enum: ["explicit", "permissions"], description: "explicit = only the people the system names; permissions = holders of the default permissions or the roles chosen here" })
  audienceKind!: string;

  @ApiProperty({ description: "The recipients are chosen elsewhere (for example on the Licence page), so no roles are offered here" })
  audienceManagedElsewhere!: boolean;

  @ApiProperty({ type: [String], description: "Permissions whose holders receive the event unless roles are chosen" })
  defaultPermissions!: string[];

  @ApiProperty()
  isEnabled!: boolean;

  @ApiProperty({ type: [String], format: "uuid", description: "Roles whose people receive the event instead of the default permission holders. Empty = the defaults." })
  roleIds!: string[];
}

export class NotificationEventSettingsResponseDto {
  @ApiProperty({ type: [NotificationEventSettingDto] })
  items!: NotificationEventSettingDto[];
}

export class UpdateNotificationEventSettingDto {
  @ApiPropertyOptional({ description: "Omit to leave as it is" })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ type: [String], format: "uuid", description: "Omit to leave as it is; [] = back to the default recipients" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID("all", { each: true })
  roleIds?: string[];
}
