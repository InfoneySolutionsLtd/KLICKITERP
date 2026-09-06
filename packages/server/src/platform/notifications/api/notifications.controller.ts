import { Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { NotifyService } from "../application/notify.service";
import { NtfNotificationEntity } from "../domain/ntf-notification.entity";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";
import { ListNotificationsResponseDto, NotificationResponseDto, UnreadCountResponseDto } from "./dto/notification-response.dto";
import { AuthenticatedRequest } from "./request-context";

function toView(entity: NtfNotificationEntity): NotificationResponseDto {
  return entity;
}

function requireUserId(req: AuthenticatedRequest): string {
  if (!req.user) {
    throw new AuthenticationException("Authentication required");
  }
  return req.user.sub;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

/**
 * Always scoped to the caller's own `req.user.sub` — no `@RequirePermission`
 * anywhere here, the same "just needs to be authenticated" shape
 * `POST /auth/password/change` already has, since this is a personal inbox,
 * never a cross-user admin view.
 */
@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notify: NotifyService) {}

  @Get()
  @ApiOperation({ summary: "List the caller's own notifications, newest first, paginated" })
  @ApiResponse({ status: 200, type: ListNotificationsResponseDto })
  async list(@Query() query: ListNotificationsQueryDto, @Req() req: AuthenticatedRequest): Promise<ListNotificationsResponseDto> {
    const userId = requireUserId(req);
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const [items, total] = await this.notify.listForUser(userId, { page, pageSize });
    return {
      items: items.map(toView),
      meta: { total, page, pageSize, pageCount: pageSize > 0 ? Math.ceil(total / pageSize) : 0 },
    };
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Count of the caller's own unread notifications — the bell badge's own poll target" })
  @ApiResponse({ status: 200, type: UnreadCountResponseDto })
  async unreadCount(@Req() req: AuthenticatedRequest): Promise<UnreadCountResponseDto> {
    const userId = requireUserId(req);
    return { count: await this.notify.countUnread(userId) };
  }

  @Post(":id/read")
  @ApiOperation({ summary: "Mark one of the caller's own notifications read (silently no-ops if not theirs or already read)" })
  @ApiResponse({ status: 201 })
  async markRead(@Param("id") id: string, @Req() req: AuthenticatedRequest): Promise<{ marked: true }> {
    const userId = requireUserId(req);
    await this.notify.markRead(id, userId);
    return { marked: true };
  }

  @Post("read-all")
  @ApiOperation({ summary: "Mark all of the caller's own notifications read" })
  @ApiResponse({ status: 201 })
  async markAllRead(@Req() req: AuthenticatedRequest): Promise<{ marked: true }> {
    const userId = requireUserId(req);
    await this.notify.markAllRead(userId);
    return { marked: true };
  }
}
