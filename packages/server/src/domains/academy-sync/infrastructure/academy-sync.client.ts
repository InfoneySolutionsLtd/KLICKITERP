import { Injectable } from "@nestjs/common";
import { AcademyStructureDto, AcademyStudentPageDto } from "../application/academy-sync.types";
import { AcademyHttpClient } from "./academy-http.client";

export interface ListAcademyStudentsParams {
  cursor?: string | null;
  /** Only used on the first page (the cursor carries the position after that). */
  updatedSince?: string | null;
  limit?: number;
  includeDeleted?: boolean;
}

/** Typed calls for the Academy's student export. */
@Injectable()
export class AcademySyncClient {
  constructor(private readonly http: AcademyHttpClient) {}

  listStudents(apiKey: string, params: ListAcademyStudentsParams): Promise<AcademyStudentPageDto> {
    return this.http.get<AcademyStudentPageDto>(apiKey, "/erp/students", {
      cursor: params.cursor ?? undefined,
      updatedSince: params.updatedSince ?? undefined,
      limit: params.limit,
      includeDeleted: params.includeDeleted ? "true" : undefined,
    });
  }

  getStructure(apiKey: string): Promise<AcademyStructureDto> {
    return this.http.get<AcademyStructureDto>(apiKey, "/erp/structure");
  }
}
