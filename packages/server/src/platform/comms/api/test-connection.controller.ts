import { Body, Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { RequirePermission } from "../../../shared/rbac/require-permission.decorator";
import { IntegrationConfigService } from "../../settings";
import { AdapterResolverService } from "../infrastructure/adapter-resolver.service";
import { CommsTestConnectionDto, CommsTestConnectionResponseDto } from "./dto/test-connection.dto";

/**
 * Real Test Connection (FR-SET-003.1) for SMTP/SMS/FCM/WHATSAPP — the
 * generic `platform/settings`-owned route (`IntegrationConfigService.testConnection()`)
 * is a permanent stub for these 4 kinds (`platform/settings` cannot import
 * `platform/comms` — it would invert the real dependency direction and,
 * since `platform/comms` already imports `platform/settings`, create a
 * genuine circular `require`). This mirrors the exact precedent
 * `domains/integrations`' own `SyncController.testConnection()` already
 * established for QUICKBOOKS/XERO/SAGE: the OWNING module exposes its own
 * real check, resolves the enabled config's real adapter, calls its
 * `testConnection()`, and writes the result back onto the resolved
 * `set_integration_config` row via `IntegrationConfigService.recordTestResult()`
 * (the one direction `platform/comms` CAN legally call back into
 * `platform/settings`).
 */
@ApiTags("comms-test-connection")
@Controller("comms/integrations")
export class CommsTestConnectionController {
  constructor(
    private readonly adapterResolverService: AdapterResolverService,
    private readonly integrationConfigService: IntegrationConfigService,
  ) {}

  @Post("test-connection")
  @RequirePermission("comms:integration:test")
  @ApiOperation({ summary: "FR-SET-003.1 Test Connection for SMTP/SMS/FCM/WHATSAPP — exercises the resolved adapter's real harmless check" })
  @ApiResponse({ status: 200, type: CommsTestConnectionResponseDto })
  async testConnection(@Body() dto: CommsTestConnectionDto): Promise<CommsTestConnectionResponseDto> {
    const { adapter, configId } = await this.adapterResolverService.resolveWithConfigId(dto.channel);
    const result = await adapter.testConnection();
    if (configId) {
      await this.integrationConfigService.recordTestResult(configId, result.ok);
    }
    return result;
  }
}
