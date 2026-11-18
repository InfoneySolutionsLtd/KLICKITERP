import { Body, Controller, Get, Post, Put, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { AcademyLinkService, AcademyLinkStatus } from "../application/academy-link.service";
import { AcademyLinkStatusDto, RegisterAcademyLinkDto } from "./dto/academy-link.dto";
import { AuthenticatedRequest } from "./request-context";

function toDto(status: AcademyLinkStatus): AcademyLinkStatusDto {
  return {
    connected: status.connected,
    registered: status.registered,
    registeredBaseUrl: status.registeredBaseUrl,
    registeredAt: status.registeredAt?.toISOString() ?? null,
    secretVersion: status.secretVersion,
    lastVerifiedAt: status.lastVerifiedAt?.toISOString() ?? null,
    lastVerifyOk: status.lastVerifyOk,
    lastVerifyMessage: status.lastVerifyMessage,
    lastInboundAt: status.lastInboundAt?.toISOString() ?? null,
    suggestedBaseUrl: status.suggestedBaseUrl,
  };
}

/**
 * Staff side of "let the Academy call this ERP": register the ERP's public address (the Academy answers with the shared
 * secret that signs its calls — never shown, never returned), and test that the Academy can actually reach it.
 */
@ApiTags("academy-sync")
@Controller("academy-sync/link")
export class AcademyLinkController {
  constructor(private readonly linkService: AcademyLinkService) {}

  @Get()
  @RequirePermission("academy:sync:view")
  @ApiOperation({ summary: "Is this ERP registered with the Academy, and did the last connection test pass?" })
  @ApiResponse({ status: 200, type: AcademyLinkStatusDto })
  async status(): Promise<AcademyLinkStatusDto> {
    return toDto(await this.linkService.getStatus());
  }

  @Put()
  @RequirePermission("academy:sync:manage")
  @ApiOperation({ summary: "Tell the Academy this ERP's public API address. Registering again replaces (rotates) the shared secret." })
  @ApiResponse({ status: 200, type: AcademyLinkStatusDto })
  async register(@Body() dto: RegisterAcademyLinkDto, @Req() req: AuthenticatedRequest): Promise<AcademyLinkStatusDto> {
    return toDto(await this.linkService.register(dto.erpBaseUrl, req.user?.sub ?? null));
  }

  @Post("test")
  @RequirePermission("academy:sync:manage")
  @ApiOperation({ summary: "Ask the Academy to call this ERP's signed ping and report whether it got through" })
  @ApiResponse({ status: 201, type: AcademyLinkStatusDto })
  async test(@Req() req: AuthenticatedRequest): Promise<AcademyLinkStatusDto> {
    return toDto(await this.linkService.testConnection(req.user?.sub ?? null));
  }
}
