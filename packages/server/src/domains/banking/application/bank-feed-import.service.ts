import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { FilesService } from "../../../platform/files";
import { BankFeedAdapterResolverService } from "../infrastructure/bank-feed-adapter-resolver.service";
import { BankStatementImportService, ImportBankStatementLinesResult } from "./bank-statement-import.service";

const DEFAULT_LOOKBACK_DAYS = 30;

/**
 * The "automated pull" half of `BankStatementPort` (see that interface's own
 * doc comment) — orchestrates fetch -> synthetic file -> `BankStatementImportService.importLines()`,
 * reusing ALL of that service's existing dedupe/insert logic rather than
 * duplicating it. Two real design decisions, made explicit rather than left
 * implicit:
 *
 * 1. **`bank_statement_import.file_id` is a `NOT NULL RESTRICT` FK to
 *    `file_object`** — an automated pull has no uploaded file. Resolved by
 *    persisting the raw fetched JSON response as a REAL, synthetic
 *    `file_object` (via `FilesService.upload()`, already a real dependency
 *    of `domains/banking` per `bank_statement_import.file_id`'s own FK) —
 *    not a schema/nullability change. Keeps `bank_statement_import`
 *    unconditionally "append-only with a real source file," no special-
 *    casing needed anywhere else that reads it.
 * 2. **`uploadedByUserId`** — there is no request-scoped acting user for a
 *    scheduled/worker-triggered fetch (unlike the manual "Fetch Now" click,
 *    which has a real one). Both paths call this same method with an
 *    explicit `actorId`; the controller passes the real authenticated user
 *    for a manual trigger, the scheduled job passes the `BANK` config row's
 *    own `createdBy` (the admin who configured that specific feed) — a real,
 *    already-on-hand user id, not a fabricated "system user" concept this
 *    codebase has no other precedent for.
 *
 * `since` (the fetch window's start) is resolved from the account's most
 * recent `bank_statement_import.importedAt`, or a fixed 30-day lookback when
 * none exists yet — the SAME dedupe-hash mechanism `importLines()` already
 * runs makes an overly-generous `since` harmless (re-fetched, already-seen
 * transactions are simply skipped as duplicates), so this doesn't need to be
 * precise.
 */
@Injectable()
export class BankFeedImportService {
  constructor(
    private readonly resolver: BankFeedAdapterResolverService,
    private readonly statementImportService: BankStatementImportService,
    private readonly filesService: FilesService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async fetchAndImport(accountId: string, actorId: string): Promise<ImportBankStatementLinesResult> {
    const resolved = await this.resolver.resolveForAccount(accountId);
    if (!resolved) {
      throw new ValidationException(`No enabled BANK integration config is set up for account ${accountId}`);
    }

    const since = await this.resolveSinceDate(accountId);
    let transactions;
    try {
      transactions = await resolved.adapter.fetchTransactions(since);
    } catch (error) {
      // A real, live-verified gap: an unreachable/misconfigured feed
      // endpoint previously bubbled up as an undifferentiated 500
      // (INTERNAL_ERROR) — confirmed live against a genuinely unreachable
      // test host, surfacing the raw network error with no domain
      // classification. This IS an expected failure mode for a mutating
      // action against an external HTTP dependency (unlike `pushEntity()`'s
      // "log-then-classify," there is no `intg_sync_log`-style row to write
      // here — nothing was created yet), so it's reclassified into a clean
      // `ValidationException` (422) carrying the real underlying message
      // verbatim, the same "never silently swallow, but never a raw 500 for
      // an expected external failure" discipline `testMpesaConnection()`
      // and `AccountingSyncService.pushEntity()` both already establish.
      const message = error instanceof Error ? error.message : String(error);
      throw new ValidationException(`Bank feed fetch failed for account ${accountId}: ${message}`);
    }

    const fileObject = await this.filesService.upload({
      buffer: Buffer.from(JSON.stringify(transactions), "utf8"),
      originalName: `bank-feed-${accountId}-${Date.now()}.json`,
      mime: "application/json",
      uploadedByUserId: actorId,
      entityType: "bank_statement_import",
      entityId: null,
    });

    const rawRows = transactions.map((t) => ({ date: t.date, description: t.description, amount: t.amount, ref: t.ref }));

    return runInTransaction(this.dataSource, (em) =>
      this.statementImportService.importLines(em, {
        accountId,
        fileId: fileObject.id,
        mappingTemplate: {
          columnMap: { date: "date", description: "description", amount: "amount", ref: "ref" },
          dateFormat: "YYYY-MM-DD",
          debitCreditConvention: "SIGNED_AMOUNT",
        },
        rawRows,
      }),
    );
  }

  private async resolveSinceDate(accountId: string): Promise<string> {
    const imports = await this.statementImportService.list(accountId);
    const mostRecent = imports.reduce<Date | null>((latest, row) => {
      return !latest || row.importedAt > latest ? row.importedAt : latest;
    }, null);
    if (mostRecent) return mostRecent.toISOString().slice(0, 10);

    const lookback = new Date();
    lookback.setDate(lookback.getDate() - DEFAULT_LOOKBACK_DAYS);
    return lookback.toISOString().slice(0, 10);
  }
}
