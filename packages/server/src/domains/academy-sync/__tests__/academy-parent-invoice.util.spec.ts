import { Money } from "../../../shared/money/money";
import {
  checkChoice,
  formatKes,
  latestDate,
  planTerm,
  sumDecimalStrings,
  type TermFacts,
  type TermLine,
} from "../application/academy-parent-invoice.util";

const TUITION = "c0000000-0000-4000-8000-000000000001";
const BOARDING = "c0000000-0000-4000-8000-000000000002";
const MILK = "c0000000-0000-4000-8000-000000000003";
const LUNCH = "c0000000-0000-4000-8000-000000000004";
const BUS = "r0000000-0000-4000-8000-000000000001";

const line = (categoryId: string, name: string, amount: string, isOptional: boolean, dueDate = "2026-02-15"): TermLine => ({
  categoryId,
  name,
  amount: Money.fromDecimalString(amount),
  dueDate,
  isOptional,
});

const LINES: TermLine[] = [
  line(TUITION, "Tuition", "20000", false),
  line(BOARDING, "Boarding", "12000", false, "2026-02-28"),
  line(MILK, "Milk", "1500", true),
  line(LUNCH, "Lunch", "4000", true),
];

const facts = (over: Partial<TermFacts> = {}): TermFacts => ({
  lines: LINES,
  schoolOptedCategoryIds: new Set(),
  billedCategoryIds: new Set(),
  liveStructureInvoice: false,
  transportBilled: false,
  routes: [{ routeId: BUS, name: "Route A", amount: Money.fromDecimalString("5000") }],
  ...over,
});

describe("planTerm — FULL: nothing of the term is billed yet", () => {
  it("includes the mandatory lines, offers the optional ones, and offers the routes", () => {
    const plan = planTerm(facts())!;
    expect(plan.mode).toBe("FULL");
    expect(plan.included.map((l) => l.categoryId)).toEqual([TUITION, BOARDING]);
    expect(plan.selectable.map((l) => l.categoryId)).toEqual([MILK, LUNCH]);
    expect(plan.routes).toHaveLength(1);
  });

  it("carries an optional line the school already opted the learner into, and does not offer it again", () => {
    const plan = planTerm(facts({ schoolOptedCategoryIds: new Set([MILK]) }))!;
    expect(plan.mode).toBe("FULL");
    expect(plan.included.map((l) => l.categoryId)).toEqual([TUITION, BOARDING, MILK]);
    expect(plan.selectable.map((l) => l.categoryId)).toEqual([LUNCH]);
  });

  it("does not offer an optional item that is already billed another way", () => {
    const plan = planTerm(facts({ billedCategoryIds: new Set([LUNCH]) }))!;
    expect(plan.mode).toBe("FULL");
    expect(plan.selectable.map((l) => l.categoryId)).toEqual([MILK]);
  });
});

describe("planTerm — TOP_UP: the school has already billed something of the term", () => {
  it("is a top-up when a structure invoice exists: no mandatory lines, only optional items not billed yet", () => {
    const plan = planTerm(facts({ liveStructureInvoice: true, billedCategoryIds: new Set([TUITION, BOARDING, MILK]) }))!;
    expect(plan.mode).toBe("TOP_UP");
    expect(plan.included).toEqual([]);
    expect(plan.selectable.map((l) => l.categoryId)).toEqual([LUNCH]);
  });

  it("is a top-up when mandatory categories were billed another way (e.g. the school's bulk ad-hoc run), even with no structure invoice — never billing tuition twice", () => {
    const plan = planTerm(facts({ billedCategoryIds: new Set([TUITION]) }))!;
    expect(plan.mode).toBe("TOP_UP");
    expect(plan.included).toEqual([]);
    expect(plan.selectable.map((l) => l.categoryId)).toEqual([MILK, LUNCH]);
  });

  it("is a top-up when an optional item the school opted the learner into is already billed elsewhere (the engine would bill it again)", () => {
    const plan = planTerm(facts({ schoolOptedCategoryIds: new Set([MILK]), billedCategoryIds: new Set([MILK]) }))!;
    expect(plan.mode).toBe("TOP_UP");
    expect(plan.selectable.map((l) => l.categoryId)).toEqual([LUNCH]);
  });

  it("is null when there is nothing left to add (everything optional billed, no route offered)", () => {
    const plan = planTerm(facts({ liveStructureInvoice: true, billedCategoryIds: new Set([TUITION, BOARDING, MILK, LUNCH]), routes: [] }));
    expect(plan).toBeNull();
  });

  it("still offers transport on its own when every optional item is billed", () => {
    const plan = planTerm(facts({ liveStructureInvoice: true, billedCategoryIds: new Set([TUITION, BOARDING, MILK, LUNCH]) }))!;
    expect(plan.mode).toBe("TOP_UP");
    expect(plan.selectable).toEqual([]);
    expect(plan.routes).toHaveLength(1);
  });
});

describe("planTerm — transport", () => {
  it("offers no route once the learner is billed for transport this term", () => {
    const plan = planTerm(facts({ transportBilled: true }))!;
    expect(plan.routes).toEqual([]);
    expect(plan.transportAlreadyBilled).toBe(true);
  });

  it("is null when a term has no lines and no active route", () => {
    expect(planTerm(facts({ lines: [], routes: [] }))).toBeNull();
  });
});

describe("checkChoice", () => {
  const full = () => planTerm(facts())!;
  const topUp = () => planTerm(facts({ liveStructureInvoice: true, billedCategoryIds: new Set([TUITION, BOARDING]) }))!;

  it("accepts optional items and a route that were offered", () => {
    expect(checkChoice(full(), { optionalCategoryIds: [MILK], routeId: BUS })).toBeNull();
  });

  it("accepts a FULL invoice with nothing extra (the whole mandatory invoice is worth generating)", () => {
    expect(checkChoice(full(), { optionalCategoryIds: [], routeId: null })).toBeNull();
  });

  it("refuses a MANDATORY category: a parent can only pick optional items", () => {
    expect(checkChoice(full(), { optionalCategoryIds: [TUITION], routeId: null })).toBe("ITEM_NOT_OFFERED");
  });

  it("refuses a category that is not on the structure at all", () => {
    expect(checkChoice(full(), { optionalCategoryIds: ["c0000000-0000-4000-8000-0000000000ff"], routeId: null })).toBe("ITEM_NOT_OFFERED");
  });

  it("refuses an optional item already billed (not offered in a top-up)", () => {
    const plan = planTerm(facts({ liveStructureInvoice: true, billedCategoryIds: new Set([TUITION, BOARDING, MILK]) }))!;
    expect(checkChoice(plan, { optionalCategoryIds: [MILK], routeId: null })).toBe("ITEM_NOT_OFFERED");
  });

  it("refuses a route that is not offered", () => {
    expect(checkChoice(full(), { optionalCategoryIds: [], routeId: "r0000000-0000-4000-8000-0000000000ff" })).toBe("ROUTE_NOT_OFFERED");
  });

  it("refuses a route when the learner is already billed for transport", () => {
    const plan = planTerm(facts({ transportBilled: true }))!;
    expect(checkChoice(plan, { optionalCategoryIds: [], routeId: BUS })).toBe("ROUTE_NOT_OFFERED");
  });

  it("refuses an empty top-up: it would create nothing", () => {
    expect(checkChoice(topUp(), { optionalCategoryIds: [], routeId: null })).toBe("NOTHING_TO_ADD");
  });

  it("refuses a FULL invoice that would have no lines at all", () => {
    const plan = planTerm(facts({ lines: [line(MILK, "Milk", "1500", true)] }))!;
    expect(plan.mode).toBe("FULL");
    expect(plan.included).toEqual([]);
    expect(checkChoice(plan, { optionalCategoryIds: [], routeId: null })).toBe("NOTHING_TO_ADD");
  });
});

describe("small helpers", () => {
  it("latestDate picks the latest YYYY-MM-DD, or null", () => {
    expect(latestDate(["2026-02-15", "2026-03-01", "2026-02-28"])).toBe("2026-03-01");
    expect(latestDate([])).toBeNull();
  });

  it("sumDecimalStrings adds exactly", () => {
    expect(sumDecimalStrings(["1500.0000", "5000.5000", "0.1000"])).toBe("6500.6000");
    expect(sumDecimalStrings([])).toBe("0.0000");
  });

  it("formatKes groups thousands and drops empty cents", () => {
    expect(formatKes("1500.0000")).toBe("1,500");
    expect(formatKes("1234567.5000")).toBe("1,234,567.50");
    expect(formatKes("0.0000")).toBe("0");
  });
});
