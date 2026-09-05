import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BankAccountEntity } from "./domain/bank-account.entity";
import { BankTransferEntity } from "./domain/bank-transfer.entity";
import { BankExternalTransferEntity } from "./domain/bank-external-transfer.entity";
import { BankDepositEntity } from "./domain/bank-deposit.entity";
import { BankWithdrawalEntity } from "./domain/bank-withdrawal.entity";
import { BankStatementImportEntity } from "./domain/bank-statement-import.entity";
import { BankStatementLineEntity } from "./domain/bank-statement-line.entity";
import { BankReconciliationEntity } from "./domain/bank-reconciliation.entity";
import { BankReconMatchEntity } from "./domain/bank-recon-match.entity";
import { BankChequeBookEntity } from "./domain/bank-cheque-book.entity";
import { BankChequeLeafEntity } from "./domain/bank-cheque-leaf.entity";
import { BankAccountRepository } from "./infrastructure/bank-account.repository";
import { BankTransferRepository } from "./infrastructure/bank-transfer.repository";
import { BankExternalTransferRepository } from "./infrastructure/bank-external-transfer.repository";
import { BankDepositRepository } from "./infrastructure/bank-deposit.repository";
import { BankWithdrawalRepository } from "./infrastructure/bank-withdrawal.repository";
import { BankStatementImportRepository } from "./infrastructure/bank-statement-import.repository";
import { BankStatementLineRepository } from "./infrastructure/bank-statement-line.repository";
import { BankReconciliationRepository } from "./infrastructure/bank-reconciliation.repository";
import { BankReconMatchRepository } from "./infrastructure/bank-recon-match.repository";
import { BankChequeBookRepository } from "./infrastructure/bank-cheque-book.repository";
import { BankChequeLeafRepository } from "./infrastructure/bank-cheque-leaf.repository";
import { AccountingModule } from "../../accounting";
import { SettingsModule } from "../../platform/settings";
import { ApprovalsModule } from "../../platform/approvals";
import { FilesModule } from "../../platform/files";
import { BankAccountsService } from "./application/bank-accounts.service";
import { BankTransfersService } from "./application/bank-transfers.service";
import { BankExternalTransfersService } from "./application/bank-external-transfers.service";
import { DepositsService } from "./application/deposits.service";
import { WithdrawalsService } from "./application/withdrawals.service";
import { BankStatementImportService } from "./application/bank-statement-import.service";
import { BankFeedImportService } from "./application/bank-feed-import.service";
import { ReconciliationService } from "./application/reconciliation.service";
import { ChequeBooksService } from "./application/cheque-books.service";
import { ChequeLeavesService } from "./application/cheque-leaves.service";
import { BankFeedAdapterResolverService } from "./infrastructure/bank-feed-adapter-resolver.service";
import { AccountsController } from "./api/accounts.controller";
import { TransfersController } from "./api/transfers.controller";
import { ExternalTransfersController } from "./api/external-transfers.controller";
import { DepositsController } from "./api/deposits.controller";
import { WithdrawalsController } from "./api/withdrawals.controller";
import { StatementImportController } from "./api/statement-import.controller";
import { ReconciliationController } from "./api/reconciliation.controller";
import { ChequeBooksController } from "./api/cheque-books.controller";
import { ChequeLeavesController } from "./api/cheque-leaves.controller";

/**
 * Module 16 (Banking) — full module anatomy on top of `accounting`,
 * `platform/settings` (`NumberingService.allocate()`), `platform/approvals`
 * (`ApprovalEngineService.submit()` for the `BANK_TRANSFERS`/`BANK_DEPOSITS`/
 * `BANK_WITHDRAWALS` single-level workflows) — the foundation pass's own
 * `domains/payments`/`domains/procurement` entity-only exceptions remain
 * entity-only (no service import needed from either here); `domains/billing`
 * is now ALSO imported (barrel-only, `resolveControlAccount()` reuse for
 * `TRANSFER_CLEARING`, see `application/gl-banking-accounts.util.ts`) —
 * `module-deps.json`'s `domains/banking` entry was extended with
 * `domains/billing` for this, the exact same reuse precedent
 * `domains/wallet`/`domains/inventory`/`domains/payroll` already
 * established.
 *
 * **Controllers array verified explicitly** — per this task's own warning
 * about a real prior near-miss in this codebase (Module 9/Billing's
 * `controllers` array once forgotten despite `tsc` passing clean, shipping
 * unreachable routes): all 9 controllers below (`AccountsController`,
 * `TransfersController`, `ExternalTransfersController`, `DepositsController`,
 * `WithdrawalsController`, `StatementImportController`,
 * `ReconciliationController`, `ChequeBooksController`,
 * `ChequeLeavesController`) ARE present.
 *
 * `ExternalTransfersController`/`BankExternalTransfersService` (P-35, added
 * after the "8 controllers, complete" note above was first written) — pays a
 * beneficiary the school does not own a `bank_account` for, a deliberately
 * separate entity/service/controller from `bank_transfer`'s own inter-
 * account transfer (see `bank-external-transfer.entity.ts`'s doc comment).
 * No new module imports needed — reuses this module's existing
 * `AccountingModule`/`ApprovalsModule`/`SettingsModule` wiring exactly like
 * `BankTransfersService` already does.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankAccountEntity,
      BankTransferEntity,
      BankExternalTransferEntity,
      BankDepositEntity,
      BankWithdrawalEntity,
      BankStatementImportEntity,
      BankStatementLineEntity,
      BankReconciliationEntity,
      BankReconMatchEntity,
      BankChequeBookEntity,
      BankChequeLeafEntity,
    ]),
    AccountingModule,
    SettingsModule,
    ApprovalsModule,
    FilesModule,
  ],
  controllers: [
    AccountsController,
    TransfersController,
    ExternalTransfersController,
    DepositsController,
    WithdrawalsController,
    StatementImportController,
    ReconciliationController,
    ChequeBooksController,
    ChequeLeavesController,
  ],
  providers: [
    BankAccountRepository,
    BankTransferRepository,
    BankExternalTransferRepository,
    BankDepositRepository,
    BankWithdrawalRepository,
    BankStatementImportRepository,
    BankStatementLineRepository,
    BankReconciliationRepository,
    BankReconMatchRepository,
    BankChequeBookRepository,
    BankChequeLeafRepository,
    BankAccountsService,
    BankTransfersService,
    BankExternalTransfersService,
    DepositsService,
    WithdrawalsService,
    BankStatementImportService,
    BankFeedAdapterResolverService,
    BankFeedImportService,
    ReconciliationService,
    ChequeBooksService,
    ChequeLeavesService,
  ],
  exports: [
    BankAccountRepository,
    BankTransferRepository,
    BankExternalTransferRepository,
    BankDepositRepository,
    BankWithdrawalRepository,
    BankStatementImportRepository,
    BankStatementLineRepository,
    BankReconciliationRepository,
    BankReconMatchRepository,
    BankChequeBookRepository,
    BankChequeLeafRepository,
    BankAccountsService,
    BankTransfersService,
    BankExternalTransfersService,
    DepositsService,
    WithdrawalsService,
    BankStatementImportService,
    ReconciliationService,
    ChequeBooksService,
    ChequeLeavesService,
  ],
})
export class BankingModule {}
