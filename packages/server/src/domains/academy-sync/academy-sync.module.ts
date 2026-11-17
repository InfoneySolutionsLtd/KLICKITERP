import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StudentsModule } from "../students";
import { AcademySyncController } from "./api/academy-sync.controller";
import { AcademySyncService } from "./application/academy-sync.service";
import { AcadClassMapEntity } from "./domain/acad-class-map.entity";
import { AcadGuardianMapEntity } from "./domain/acad-guardian-map.entity";
import { AcadStudentMapEntity } from "./domain/acad-student-map.entity";
import { AcadSyncRunEntity } from "./domain/acad-sync-run.entity";
import { AcadSyncStateEntity } from "./domain/acad-sync-state.entity";
import { AcadClassMapRepository } from "./infrastructure/acad-class-map.repository";
import { AcadGuardianMapRepository } from "./infrastructure/acad-guardian-map.repository";
import { AcadStudentMapRepository } from "./infrastructure/acad-student-map.repository";
import { AcadSyncRunRepository } from "./infrastructure/acad-sync-run.repository";
import { AcadSyncStateRepository } from "./infrastructure/acad-sync-state.repository";
import { AcademyHttpClient } from "./infrastructure/academy-http.client";
import { AcademySyncClient } from "./infrastructure/academy-sync.client";

/**
 * Pulls a school's students and parents from the Klickit Academy into the ERP (and, in later phases, publishes
 * invoices to the Academy parent portal and receives payment requests from it).
 *
 * The Academy link (school code -> API key) belongs to `licensing`, which is structurally isolated and cannot be
 * imported; this module reaches it through the shared `ACADEMY_LINK_PORT` token, made visible app-wide by
 * `licensing`'s `@Global()` `AcademyLinkPortModule`. `AppConfigService` comes from the global `SharedInfraModule`.
 *
 * Exports `AcademySyncService` so `apps/worker` can drive the scheduled runs.
 */
@Module({
  imports: [
    StudentsModule,
    TypeOrmModule.forFeature([AcadSyncStateEntity, AcadStudentMapEntity, AcadGuardianMapEntity, AcadClassMapEntity, AcadSyncRunEntity]),
  ],
  controllers: [AcademySyncController],
  providers: [
    AcadSyncStateRepository,
    AcadStudentMapRepository,
    AcadGuardianMapRepository,
    AcadClassMapRepository,
    AcadSyncRunRepository,
    AcademyHttpClient,
    AcademySyncClient,
    AcademySyncService,
  ],
  exports: [AcademySyncService],
})
export class AcademySyncModule {}
