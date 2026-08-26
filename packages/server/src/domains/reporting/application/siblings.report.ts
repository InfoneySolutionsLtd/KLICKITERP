import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ReportColumnDef, ReportDefinition, ReportResult } from "./report-registry.service";

export type SiblingsParams = Record<string, never>;

interface RawSiblingRow {
  guardian_id: string;
  guardian_name: string;
  relationship: string;
  is_primary: boolean;
  student_id: string;
  admission_no: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  status: string;
  class_name: string;
  stream_name: string | null;
}

/**
 * Students who share at least one guardian (siblings), for billing/admin
 * purposes — e.g. sibling-discount eligibility checks. "Siblings" = students
 * linked via `std_student_guardian` to the SAME `guardian_id` row; the
 * `sibling_guardians` CTE finds every guardian with 2+ distinct linked
 * students (`GROUP BY guardian_id HAVING COUNT(DISTINCT student_id) > 1`),
 * then the outer query pulls one row per (guardian, student) pair for
 * display, ordered so each guardian's own children sit together. No params
 * — a full listing (the report's own scope is genuinely "show me all of
 * them," not a filtered/date-ranged query like the rest of this module).
 */
@Injectable()
export class SiblingsReport implements ReportDefinition<SiblingsParams> {
  readonly code = "siblings";
  readonly name = "Siblings Report";
  readonly domain = "students";
  readonly permissionCode = "reports:siblings:view";
  readonly paramsShape = {} as const;
  readonly columns: ReportColumnDef[] = [
    { key: "guardianName", label: "Guardian", type: "string" },
    { key: "relationship", label: "Relationship", type: "string" },
    { key: "studentName", label: "Student", type: "string" },
    { key: "admissionNo", label: "Admission No.", type: "string" },
    { key: "className", label: "Class", type: "string" },
    { key: "streamName", label: "Stream", type: "string" },
    { key: "status", label: "Status", type: "string" },
  ];

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async execute(): Promise<ReportResult> {
    const rawRows: RawSiblingRow[] = await this.dataSource.query(
      `WITH sibling_guardians AS (
         SELECT guardian_id
         FROM app.std_student_guardian
         GROUP BY guardian_id
         HAVING COUNT(DISTINCT student_id) > 1
       )
       SELECT g.id AS guardian_id, g.full_name AS guardian_name,
              sg.relationship, sg.is_primary,
              s.id AS student_id, s.admission_no, s.first_name, s.middle_name, s.last_name, s.status,
              c.name AS class_name, st.name AS stream_name
       FROM sibling_guardians sgd
       JOIN app.std_student_guardian sg ON sg.guardian_id = sgd.guardian_id
       JOIN app.std_student s ON s.id = sg.student_id
       JOIN app.std_guardian g ON g.id = sg.guardian_id
       JOIN app.std_class c ON c.id = s.class_id
       LEFT JOIN app.std_stream st ON st.id = s.stream_id
       ORDER BY g.full_name ASC, s.admission_no ASC`,
    );

    const guardianIds = new Set<string>();
    const rows = rawRows.map((row) => {
      guardianIds.add(row.guardian_id);
      const studentName = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(" ");
      return {
        guardianId: row.guardian_id,
        guardianName: row.guardian_name,
        relationship: row.relationship,
        isPrimary: row.is_primary,
        studentId: row.student_id,
        studentName,
        admissionNo: row.admission_no,
        className: row.class_name,
        streamName: row.stream_name,
        status: row.status,
      };
    });

    return {
      rows,
      totals: { siblingGroupCount: guardianIds.size, studentCount: rows.length },
      generatedAt: new Date(),
    };
  }
}
