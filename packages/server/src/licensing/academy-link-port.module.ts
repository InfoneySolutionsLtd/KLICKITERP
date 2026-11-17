import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ACADEMY_LINK_PORT } from "../shared/integrations/academy/academy-link.port";
import { AcademyLinkPortAdapter } from "./application/academy-link-port.adapter";
import { AcademyLinkEntity } from "./domain/academy-link.entity";
import { AcademyLinkRepository } from "./infrastructure/academy-link.repository";

/**
 * Makes the Academy link visible to the rest of the app through the shared `ACADEMY_LINK_PORT` token.
 *
 * `@Global()` is required, not stylistic: `licensing` is structurally isolated (nothing may import it, see
 * `module-deps.json`), so a consumer such as `domains/academy-sync` cannot list a licensing module in its own
 * `imports`. A global module's exports are visible to every injector once it is imported anywhere —
 * `LicensingModule` imports it, and both composition roots (`apps/api`, `apps/worker`) mount `LicensingModule`.
 * It carries its own `AcademyLinkRepository` instance (a stateless wrapper over the same table) so it does not
 * depend on `LicensingModule`'s provider list.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AcademyLinkEntity])],
  providers: [AcademyLinkRepository, AcademyLinkPortAdapter, { provide: ACADEMY_LINK_PORT, useExisting: AcademyLinkPortAdapter }],
  exports: [ACADEMY_LINK_PORT],
})
export class AcademyLinkPortModule {}
