import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StudentsModule } from "../students";
import { AcademyInboundController } from "./api/academy-inbound.controller";
import { AcademyInboundGuard } from "./api/academy-inbound.guard";
import { AcademyLinkController } from "./api/academy-link.controller";
import { AcademySyncController } from "./api/academy-sync.controller";
import { AcademyLinkService } from "./application/academy-link.service";
import { AcademySyncService } from "./application/academy-sync.service";
import { AcadClassMapEntity } from "./domain/acad-class-map.entity";
import { AcadGuardianMapEntity } from "./domain/acad-guardian-map.entity";
import { AcadInboundLinkEntity } from "./domain/acad-inbound-link.entity";
import { AcadStudentMapEntity } from "./domain/acad-student-map.entity";
import { AcadSyncRunEntity } from "./domain/acad-sync-run.entity";
import { AcadSyncStateEntity } from "./domain/acad-sync-state.entity";
import { AcadClassMapRepository } from "./infrastructure/acad-class-map.repository";
import { AcadGuardianMapRepository } from "./infrastructure/acad-guardian-map.repository";
import { AcadInboundLinkRepository } from "./infrastructure/acad-inbound-link.repository";
import { AcadStudentMapRepository } from "./infrastructure/acad-student-map.repository";
import { AcadSyncRunRepository } from "./infrastructure/acad-sync-run.repository";
import { AcadSyncStateRepository } from "./infrastructure/acad-sync-state.repository";
import { AcademyHttpClient } from "./infrastructure/academy-http.client";
import { AcademySyncClient } from "./infrastructure/academy-sync.client";

/**
 * The Academy <-> ERP integration: pulls a school's students and parents from the Klickit Academy into the ERP, and
 * (Phase 0 onwards) lets the Academy call the ERP back through signed requests — the base for publishing invoices to the
 * parent portal and receiving payment requests from it.
 *
 * The Academy link (school code -> API key) belongs to `licensing`, which is structurally isolated and cannot be
 * imported; this module reaches it through the shared `ACADEMY_LINK_PORT` token, made visible app-wide by
 * `licensing`'s `@Global()` `AcademyLinkPortModule`. `AppConfigService` and the Redis client (the inbound nonce replay
 * cache) come from the global `SharedInfraModule`.
 *
 * Exports `AcademySyncService` so `apps/worker` can drive the scheduled runs.
 */
@Module({
  imports: [
    StudentsModule,
    TypeOrmModule.forFeature([
      AcadSyncStateEntity,
      AcadStudentMapEntity,
      AcadGuardianMapEntity,
      AcadClassMapEntity,
      AcadSyncRunEntity,
      AcadInboundLinkEntity,
    ]),
  ],
  controllers: [AcademySyncController, AcademyLinkController, AcademyInboundController],
  providers: [
    AcadSyncStateRepository,
    AcadStudentMapRepository,
    AcadGuardianMapRepository,
    AcadClassMapRepository,
    AcadSyncRunRepository,
    AcadInboundLinkRepository,
    AcademyHttpClient,
    AcademySyncClient,
    AcademySyncService,
    AcademyLinkService,
    AcademyInboundGuard,
  ],
  exports: [AcademySyncService],
})
export class AcademySyncModule {}
