import { Injectable } from "@nestjs/common";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { NOTIFICATION_CATEGORIES, isNotificationCategory, type NotificationCategory } from "../domain/notification-catalogue";
import { NtfUserPreferenceRepository } from "../infrastructure/ntf-user-preference.repository";

export interface NotificationPreferenceView {
  category: NotificationCategory;
  /** Approvals and security: always delivered, so they cannot be switched off here. */
  essential: boolean;
  isEnabled: boolean;
}

/**
 * Each person's own filter on their bell (FR-COMM-001: "per-category preferences"). A category with no stored choice is on.
 * Essential categories are always on: a person cannot miss an approval waiting for them or a security alert about their
 * account by switching a category off (the school can still switch a whole event off in the settings).
 */
@Injectable()
export class NotificationPreferencesService {
  constructor(private readonly repo: NtfUserPreferenceRepository) {}

  async list(userId: string): Promise<NotificationPreferenceView[]> {
    const stored = new Map((await this.repo.listForUser(userId)).map((row) => [row.category, row.isEnabled]));
    return NOTIFICATION_CATEGORIES.map((category) => ({
      category: category.code,
      essential: category.essential,
      isEnabled: category.essential ? true : (stored.get(category.code) ?? true),
    }));
  }

  async set(userId: string, category: string, isEnabled: boolean): Promise<NotificationPreferenceView[]> {
    if (!isNotificationCategory(category)) {
      throw new ValidationException(`Unknown notification category: ${category}`);
    }
    const definition = NOTIFICATION_CATEGORIES.find((entry) => entry.code === category);
    if (definition?.essential && !isEnabled) {
      throw new ValidationException("This category cannot be switched off");
    }
    await this.repo.upsert(userId, category, isEnabled);
    return this.list(userId);
  }
}
