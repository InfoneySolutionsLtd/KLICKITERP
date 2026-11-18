import { Injectable } from "@nestjs/common";
import { AcademyHttpClient } from "./academy-http.client";
import { InvoiceSnapshot } from "./academy-invoice-snapshot.repository";

/** What the Academy did with one snapshot. `STALE` = it already holds this invoice at the same or a newer version. */
export type InvoiceSyncOutcome = "CREATED" | "UPDATED" | "UNCHANGED" | "STALE" | "REJECTED";

export interface InvoiceSyncResult {
  erpInvoiceId: string;
  outcome: InvoiceSyncOutcome;
  /** Set for `REJECTED`: why (e.g. the student does not belong to this school in the Academy). */
  reason?: string;
}

/** The Academy accepts at most this many invoices per request. */
export const INVOICE_SYNC_BATCH_SIZE = 100;

/** Typed calls for publishing to the Academy parent portal. Every call is an idempotent upsert, so the retrying client is safe. */
@Injectable()
export class AcademyPublishClient {
  constructor(private readonly http: AcademyHttpClient) {}

  syncInvoices(apiKey: string, invoices: InvoiceSnapshot[]): Promise<{ results: InvoiceSyncResult[] }> {
    return this.http.post<{ results: InvoiceSyncResult[] }>(apiKey, "/erp/fee-invoices/sync", { invoices });
  }
}
