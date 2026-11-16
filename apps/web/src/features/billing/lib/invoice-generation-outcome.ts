/**
 * Pure decisions for the bulk "Generate Invoice" screen's result: what to tell the user (toast kind +
 * which message) and whether/where to send them next. Kept free of React so the rules are easy to read
 * and to check on their own.
 */

export interface GenerationRunSummary {
  /** Invoices generated across all students. */
  invoices: number;
  /** Students that got at least one invoice. */
  students: number;
  /** Students whose generation failed. */
  failed: number;
  /** Wallet / credit-balance collections that need a person's attention (failed, needs approval, insufficient balance). */
  collectionProblems: number;
}

export type GenerationMessageKey = "generated" | "partialFailure" | "collectionAttention" | "noneGenerated" | "nothingToGenerate";

export interface GenerationOutcome {
  kind: "success" | "warning" | "error";
  messageKey: GenerationMessageKey;
  /** True only for a clean run — the screen then moves on to the open-invoice list. Anything that needs reading stays put. */
  leaveScreen: boolean;
}

/**
 *  - nothing generated, some students failed        -> error, stay;
 *  - nothing generated, nothing failed (all skipped) -> warning, stay;
 *  - generated, but some students failed             -> warning, stay (the failures are listed on the screen);
 *  - generated, but a wallet/credit step needs care  -> warning, stay;
 *  - generated and clean                             -> success, leave.
 */
export function summarizeGeneration(run: GenerationRunSummary): GenerationOutcome {
  if (run.invoices === 0) {
    return run.failed > 0
      ? { kind: "error", messageKey: "noneGenerated", leaveScreen: false }
      : { kind: "warning", messageKey: "nothingToGenerate", leaveScreen: false };
  }
  if (run.failed > 0) return { kind: "warning", messageKey: "partialFailure", leaveScreen: false };
  if (run.collectionProblems > 0) return { kind: "warning", messageKey: "collectionAttention", leaveScreen: false };
  return { kind: "success", messageKey: "generated", leaveScreen: true };
}

export type OpenInvoiceBucket = "PENDING" | "UPCOMING";

/**
 * "Today" exactly as the Pending / Upcoming list endpoints define it: they are called without an
 * `asOfDate`, and the server then defaults to the UTC calendar date
 * (`new Date().toISOString().slice(0, 10)`, `InvoicesController`). Using the browser's LOCAL date here
 * would disagree with the lists for a few hours around local midnight and could send someone to a page
 * their invoices are not on.
 */
export function serverToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Which list the generated invoices landed on — the same split the lists use: an OPEN invoice (balance
 * above zero, not void) whose due date is before today is PENDING, due today or later is UPCOMING. An
 * invoice already paid in full (e.g. settled from the wallet in the same run) is on neither list.
 *
 * If the run produced both kinds, PENDING wins: overdue is the one that needs chasing. Returns `null`
 * when none of them is on either list, in which case there is nowhere sensible to send the user.
 */
export function chooseOpenInvoiceBucket(
  invoices: { dueDate: string; balance: string; status: string }[],
  today: string = serverToday(),
): OpenInvoiceBucket | null {
  const open = invoices.filter((invoice) => invoice.status !== "VOID" && Number(invoice.balance) > 0);
  if (open.length === 0) return null;
  return open.some((invoice) => invoice.dueDate.slice(0, 10) < today) ? "PENDING" : "UPCOMING";
}

/** `mapper` over `items`, at most `limit` at a time, results in the original order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
