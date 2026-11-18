import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../../shared/rbac/public.decorator";
import { AcademyInboundGuard } from "./academy-inbound.guard";

/**
 * Where the Klickit Academy calls this ERP. Every route here is `@Public()` (no user token) and protected instead by
 * `AcademyInboundGuard` — a per-school HMAC signature with replay protection (`academy-signature.ts`).
 *
 * Phase 0 has just `ping`: it lets the Academy (and the admin's "Test connection") prove the whole path works — the
 * address is reachable, the secret matches, the clocks agree — before anything real depends on it. Payment requests and
 * receipt downloads arrive here in later phases.
 */
@ApiTags("academy-inbound")
@Controller("academy/inbound")
export class AcademyInboundController {
  @Get("ping")
  @Public()
  @UseGuards(AcademyInboundGuard)
  @ApiHeader({ name: "X-Klickit-Signature", required: true, description: "v1=<hex HMAC-SHA256>, see academy-signature.ts" })
  @ApiOperation({ summary: "Academy -> ERP: signed reachability check" })
  ping(): { ok: true; product: string; serverTime: string } {
    return { ok: true, product: "klickit-erp", serverTime: new Date().toISOString() };
  }
}
