import { Injectable } from "@nestjs/common";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { RolesService } from "../../users";
import { NOTIFICATION_EVENTS, findNotificationEvent, isEssentialCategory, type NotificationCategory } from "../domain/notification-catalogue";
import { NtfEventSettingRepository } from "../infrastructure/ntf-event-setting.repository";

export interface NotificationEventSettingView {
  code: string;
  category: NotificationCategory;
  /** The category cannot be switched off by an individual (approvals, security); the school may still switch the event off. */
  essentialCategory: boolean;
  /** `explicit`: only the people the system names (approvers, you...). `permissions`: people holding the permissions below, or the roles chosen here. */
  audienceKind: "explicit" | "permissions";
  /** The recipients are chosen elsewhere (for example on the Licence page), so no roles are offered here. */
  audienceManagedElsewhere: boolean;
  defaultPermissions: string[];
  isEnabled: boolean;
  /** Roles whose people receive the event INSTEAD of the default permission holders. Empty = the defaults. */
  roleIds: string[];
}

export interface UpdateNotificationEventSettingInput {
  isEnabled?: boolean;
  roleIds?: string[];
}

/**
 * The school's choice for each bell notification (FR-COMM-003: "each trigger SHALL be individually enable/disable-able").
 * Every catalogue event is listed whether or not the school ever touched it; an untouched one is ON with its default
 * recipients, so a notification is never silently missing just because nobody opened this screen.
 */
@Injectable()
export class NotificationSettingsService {
  constructor(
    private readonly repo: NtfEventSettingRepository,
    private readonly roles: RolesService,
  ) {}

  async list(): Promise<NotificationEventSettingView[]> {
    const stored = new Map((await this.repo.list()).map((row) => [row.eventCode, row]));
    return NOTIFICATION_EVENTS.map((event) => {
      const row = stored.get(event.code);
      return {
        code: event.code,
        category: event.category,
        essentialCategory: isEssentialCategory(event.category),
        audienceKind: event.audience.kind,
        audienceManagedElsewhere: "audienceManagedElsewhere" in event && event.audienceManagedElsewhere === true,
        defaultPermissions: event.audience.kind === "permissions" ? [...event.audience.permissions] : [],
        isEnabled: row?.isEnabled ?? true,
        roleIds: row?.roleIds ?? [],
      };
    });
  }

  async update(eventCode: string, input: UpdateNotificationEventSettingInput, actorId: string | null): Promise<NotificationEventSettingView> {
    const event = findNotificationEvent(eventCode);
    if (!event) throw new NotFoundException("NotificationEvent", eventCode);

    const existing = await this.repo.findByCode(eventCode);
    const roleIds = input.roleIds === undefined ? (existing?.roleIds ?? []) : [...new Set(input.roleIds)];

    if (input.roleIds !== undefined && roleIds.length > 0) {
      const managedElsewhere = "audienceManagedElsewhere" in event && event.audienceManagedElsewhere === true;
      if (event.audience.kind !== "permissions" || managedElsewhere) {
        throw new ValidationException("The people who receive this notification are not chosen here");
      }
      const known = new Set((await this.roles.list()).map((role) => role.id));
      const unknown = roleIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        throw new ValidationException(`Unknown role: ${unknown.join(", ")}`);
      }
    }

    await this.repo.upsert(eventCode, { isEnabled: input.isEnabled ?? existing?.isEnabled ?? true, roleIds }, actorId);
    const updated = (await this.list()).find((view) => view.code === eventCode);
    return updated as NotificationEventSettingView;
  }
}
