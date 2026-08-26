/**
 * Ports & adapters boundary (docs/phase-3/02-communication-authentication.md
 * §1.5: `banking: BankStatementPort ─ CsvAdapter | OfxAdapter | Mt940Adapter |
 * (per-bank API adapters)`) — until this pass, a name that existed only in
 * doc comments (`IntegrationConfigService`/`SetIntegrationConfigEntity`'s own
 * doc comments), never real code. The "CSV" half of that diagram is already
 * served, structurally differently, by `BankStatementImportService.importLines()`
 * (client-parsed rows + a saved `columnMap`, not a server-side adapter) —
 * this port covers the OTHER half: an automated PULL from a bank/aggregator's
 * own API, landing in the exact same `bank_statement_line` target shape via
 * the same `importLines()` call (see `GenericHttpBankFeedAdapter`'s own doc
 * comment for how the two connect).
 */
export interface RawBankFeedTransaction {
  date: string;
  description: string;
  /** Signed decimal string — positive = money in (debit), negative = money out (credit), the SAME convention `BankStatementColumnMap`'s `SIGNED_AMOUNT` mode already uses. */
  amount: string;
  ref?: string;
}

export interface BankStatementPort {
  /** `since` is an ISO date (`YYYY-MM-DD`) — the caller resolves this from the account's last import, or a fixed lookback when there is none yet. */
  fetchTransactions(since: string): Promise<RawBankFeedTransaction[]>;
}
