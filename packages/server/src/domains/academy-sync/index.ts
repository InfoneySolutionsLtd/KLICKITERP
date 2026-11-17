/**
 * Public barrel — the only surface a sibling module (or a composition root) should import from.
 */
export { AcademySyncModule } from "./academy-sync.module";
export { AcademySyncService } from "./application/academy-sync.service";
export type { StartRunOptions, StartedRun } from "./application/academy-sync.service";
export { AcadSyncStateEntity } from "./domain/acad-sync-state.entity";
export { AcadStudentMapEntity } from "./domain/acad-student-map.entity";
export { AcadGuardianMapEntity } from "./domain/acad-guardian-map.entity";
export { AcadClassMapEntity } from "./domain/acad-class-map.entity";
export { AcadSyncRunEntity } from "./domain/acad-sync-run.entity";
