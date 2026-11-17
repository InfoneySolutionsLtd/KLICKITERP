import { AcademyStudentDto } from "../application/academy-sync.types";
import { fingerprintStudent, laterOf, levelNumberFromName, normalizePhone, splitFullName } from "../application/academy-sync.util";

const student = (over: Partial<AcademyStudentDto> = {}): AcademyStudentDto => ({
  id: "a1",
  fullName: "Amina Wanjiru Kamau",
  admissionNumber: "1001",
  status: "ACTIVE",
  gender: "F",
  dateOfBirth: null,
  nationalId: null,
  levelId: "L4",
  levelName: "Grade 4",
  streamId: "S1",
  streamName: "North",
  accountType: "SCHOOL",
  parents: [{ id: "p1", firstName: "Grace", lastName: "Kamau", email: "Grace@X.test", phoneNumber: "+254 712 345 678", relationship: "Mother", status: "ACTIVE" }],
  updatedAt: "2026-11-01T10:00:00.000Z",
  deletedAt: null,
  ...over,
});

describe("splitFullName", () => {
  it("splits first / middle / last", () => {
    expect(splitFullName("Amina Wanjiru Kamau")).toEqual({ firstName: "Amina", middleName: "Wanjiru", lastName: "Kamau" });
    expect(splitFullName("Amina Kamau")).toEqual({ firstName: "Amina", middleName: null, lastName: "Kamau" });
    expect(splitFullName("Mary Jane Anne Kamau")).toEqual({ firstName: "Mary", middleName: "Jane Anne", lastName: "Kamau" });
  });

  it("collapses stray whitespace", () => {
    expect(splitFullName("  Amina   Kamau  ")).toEqual({ firstName: "Amina", middleName: null, lastName: "Kamau" });
  });

  it("refuses a one-word or empty name instead of inventing a surname", () => {
    expect(splitFullName("Amina")).toBeNull();
    expect(splitFullName("   ")).toBeNull();
    expect(splitFullName(null)).toBeNull();
    expect(splitFullName(undefined)).toBeNull();
  });

  it("truncates to the column size", () => {
    const long = "A".repeat(100);
    const result = splitFullName(`${long} ${long}`);
    expect(result?.firstName).toHaveLength(60);
    expect(result?.lastName).toHaveLength(60);
  });
});

describe("normalizePhone", () => {
  it.each([
    ["+254712345678", "0712345678"],
    ["254712345678", "0712345678"],
    ["+254 712 345 678", "0712345678"],
    ["0712-345-678", "0712345678"],
    ["712345678", "0712345678"],
    ["0712345678", "0712345678"],
    ["0112345678", "0112345678"],
    ["+254112345678", "0112345678"],
  ])("brings %s to %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("keeps a number it does not recognise as typed (trimmed, at most 20 chars)", () => {
    expect(normalizePhone(" +256 700 000 000 ")).toBe("+256 700 000 000");
    expect(normalizePhone("1".repeat(40))).toHaveLength(20);
  });

  it("returns null for nothing", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("levelNumberFromName", () => {
  it("reads the first whole number", () => {
    expect(levelNumberFromName("Grade 4")).toBe(4);
    expect(levelNumberFromName("Form 2 East")).toBe(2);
    expect(levelNumberFromName("PP1")).toBe(1);
  });
  it("returns null when there is none", () => {
    expect(levelNumberFromName("Baby Class")).toBeNull();
  });
});

describe("fingerprintStudent", () => {
  it("is stable for the same record", () => {
    expect(fingerprintStudent(student())).toBe(fingerprintStudent(student()));
  });

  it("ignores things the ERP does not care about", () => {
    expect(fingerprintStudent(student({ updatedAt: "2030-01-01T00:00:00.000Z", gender: "M" }))).toBe(fingerprintStudent(student()));
  });

  it("ignores equivalent phone formats and email case", () => {
    const other = student({
      parents: [{ id: "p1", firstName: "Grace", lastName: "Kamau", email: "grace@x.test", phoneNumber: "0712345678", relationship: "Mother", status: "ACTIVE" }],
    });
    expect(fingerprintStudent(other)).toBe(fingerprintStudent(student()));
  });

  it("changes when something the ERP uses changes", () => {
    const base = fingerprintStudent(student());
    expect(fingerprintStudent(student({ fullName: "Amina Kamau" }))).not.toBe(base);
    expect(fingerprintStudent(student({ admissionNumber: "1002" }))).not.toBe(base);
    expect(fingerprintStudent(student({ status: "ALUMNI" }))).not.toBe(base);
    expect(fingerprintStudent(student({ levelId: "L5" }))).not.toBe(base);
    expect(fingerprintStudent(student({ streamId: "S2" }))).not.toBe(base);
    expect(fingerprintStudent(student({ parents: [] }))).not.toBe(base);
  });

  it("does not depend on the order of the parents", () => {
    const a = { id: "p1", firstName: "A", lastName: "One", email: null, phoneNumber: "0711111111", relationship: null, status: "ACTIVE" };
    const b = { id: "p2", firstName: "B", lastName: "Two", email: null, phoneNumber: "0722222222", relationship: null, status: "ACTIVE" };
    expect(fingerprintStudent(student({ parents: [a, b] }))).toBe(fingerprintStudent(student({ parents: [b, a] })));
  });

  it("is a 64-character hex digest (so the 'pending' placeholder can never equal one)", () => {
    expect(fingerprintStudent(student())).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("laterOf", () => {
  it("keeps the later of two Academy timestamps", () => {
    expect(laterOf("2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z")).toBe("2026-02-01T00:00:00.000Z");
    expect(laterOf("2026-03-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z")).toBe("2026-03-01T00:00:00.000Z");
  });
  it("copes with nothing on either side", () => {
    expect(laterOf(null, "2026-02-01T00:00:00.000Z")).toBe("2026-02-01T00:00:00.000Z");
    expect(laterOf("2026-02-01T00:00:00.000Z", null)).toBe("2026-02-01T00:00:00.000Z");
    expect(laterOf(null, null)).toBeNull();
  });
});
