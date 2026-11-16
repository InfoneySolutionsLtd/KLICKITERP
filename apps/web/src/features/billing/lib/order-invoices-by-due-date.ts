import { getInvoice } from "../api/invoices.api";

/**
 * The outcome of `orderInvoicesByDueDate()`. Never thrown: `numberById` is
 * always usable for labelling result lines (empty if the invoices couldn't be
 * loaded), while `ok` says whether the due-date order the wallet sweep /
 * credit-balance call needs is available.
 */
export type InvoiceOrdering =
  | {
      ok: true;
      /** Invoice ids, oldest due date first. */
      orderedIds: string[];
      /** Human-readable invoice number per id — an id means nothing to an accountant. */
      numberById: Map<string, string>;
    }
  | { ok: false; error: unknown; numberById: Map<string, string> };

/**
 * Loads the given invoices once and returns BOTH what a collection step needs
 * and what its result lines show:
 *
 *  - the ids sorted by real `dueDate` ascending (oldest first) —
 *    `sweepToInvoices()`'s own contract requires a caller-ordered,
 *    oldest-due-first list (see `wallets.api.ts`'s doc comment), and
 *    `applyStudentCredit()` has the identical contract. The bulk-generate
 *    services build their `invoiceIds` result from
 *    `BillFeeStructureLineRepository.listByStructureAndTerm()`, which issues a
 *    plain `.find()` with NO `ORDER BY` clause — so the array order the ids
 *    come back in is NOT guaranteed to be due-date order at the SQL level,
 *    just usually-coincidentally close to it. Rather than trust that
 *    coincidence, this re-sorts explicitly by each invoice's own real
 *    `dueDate` (an ISO `YYYY-MM-DD` string, so a plain lexicographic compare
 *    is correct);
 *  - each invoice's `number`, so the per-invoice result lines can say
 *    "INV-000123" rather than a fragment of a UUID.
 *
 * A failure to load any invoice is returned (`ok: false`), not thrown, so a
 * caller can still report every invoice of that student as failed — exactly as
 * it did when this was a throwing helper inside its own `try` block.
 */
export async function orderInvoicesByDueDate(invoiceIds: string[]): Promise<InvoiceOrdering> {
  try {
    const invoices = await Promise.all(
      invoiceIds.map(async (invoiceId) => {
        const invoice = await getInvoice(invoiceId);
        return { invoiceId, dueDate: invoice.dueDate, number: invoice.number };
      }),
    );
    invoices.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
    return {
      ok: true,
      orderedIds: invoices.map((i) => i.invoiceId),
      numberById: new Map(invoices.map((i) => [i.invoiceId, i.number])),
    };
  } catch (error) {
    return { ok: false, error, numberById: new Map() };
  }
}
