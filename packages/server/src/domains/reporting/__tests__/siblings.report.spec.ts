import { DataSource } from "typeorm";
import { SiblingsReport } from "../application/siblings.report";

describe("SiblingsReport", () => {
  let dataSource: { query: jest.Mock };
  let report: SiblingsReport;

  beforeEach(() => {
    dataSource = { query: jest.fn(async () => []) };
    report = new SiblingsReport(dataSource as unknown as DataSource);
  });

  it("returns one row per sibling with a distinct-guardian group count", async () => {
    dataSource.query.mockResolvedValue([
      {
        guardian_id: "g-1",
        guardian_name: "Jane Doe",
        relationship: "Mother",
        is_primary: true,
        student_id: "s-1",
        admission_no: "A001",
        first_name: "John",
        middle_name: null,
        last_name: "Doe",
        status: "ACTIVE",
        class_name: "Grade 4",
        stream_name: "Blue",
      },
      {
        guardian_id: "g-1",
        guardian_name: "Jane Doe",
        relationship: "Mother",
        is_primary: true,
        student_id: "s-2",
        admission_no: "A002",
        first_name: "Jill",
        middle_name: null,
        last_name: "Doe",
        status: "ACTIVE",
        class_name: "Grade 2",
        stream_name: null,
      },
    ]);

    const result = await report.execute();

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ studentName: "John Doe", admissionNo: "A001" });
    const totals = result.totals as { siblingGroupCount: number; studentCount: number };
    expect(totals.siblingGroupCount).toBe(1);
    expect(totals.studentCount).toBe(2);

    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain("HAVING COUNT(DISTINCT student_id) > 1");
  });

  it("takes no params", () => {
    expect(report.paramsShape).toEqual({});
  });
});
