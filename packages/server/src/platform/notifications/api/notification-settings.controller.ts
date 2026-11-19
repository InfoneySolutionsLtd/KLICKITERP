import { Body, Controller, Get, Param, Put, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { NotificationSettingsService } from "../application/notification-settings.service";
import { NotificationEventSettingDto, NotificationEventSettingsResponseDto, UpdateNotificationEventSettingDto } from "./dto/notification-settings.dto";
import { AuthenticatedRequest } from "./request-context";

/**
 * The school's choice per bell notification: on/off and which roles receive it. Gated by the Communications trigger-binding
 * permissions (it is the same question — which events send, and to whom — answered for the in-app channel), so no new
 * permission or role grant is needed.
 */
@ApiTags("notifications")
@Controller("notifications/settings")
export class NotificationSettingsController {
  constructor(private readonly settings: NotificationSettingsService) {}

  @Get()
  @RequirePermission("comms:trigger-binding:view")
  @ApiOperation({ summary: "Every bell notification the system can send, with the school's on/off and receiving roles (untouched ones are on, with their default recipients)" })
  @ApiResponse({ status: 200, type: NotificationEventSettingsResponseDto })
  async list(): Promise<NotificationEventSettingsResponseDto> {
    return { items: await this.settings.list() };
  }

  @Put(":eventCode")
  @RequirePermission("comms:trigger-binding:manage")
  @ApiOperation({ summary: "Switch one bell notification on or off for the whole school, and choose the roles that receive it" })
  @ApiResponse({ status: 200, type: NotificationEventSettingDto })
  async update(@Param("eventCode") eventCode: string, @Body() dto: UpdateNotificationEventSettingDto, @Req() req: AuthenticatedRequest): Promise<NotificationEventSettingDto> {
    return this.settings.update(eventCode, dto, req.user?.sub ?? null);
  }
}
