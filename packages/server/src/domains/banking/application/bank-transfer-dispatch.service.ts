import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { runInTransaction } from "../../../shared/database/tx";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { generateUuidV7 } from "../../../shared/ids/uuid7";
import { KcbBuniApiClient, KcbApiResponse, describeKcbFailure } from "../../../shared/integrations/kcb-buni/kcb-buni-api.client";
import { KcbBuniConfigResolverService, ResolvedKcbBuni } from "../../../platform/settings";
import { Money } from "../../../shared/money/money";
import { BankExternalTransferDispatchEntity, BankDispatchStatus } from "../domain/bank-external-transfer-dispatch.entity";
import { BankAccountRepository } from "../infrastructure/bank-account.repository";
import { BankExternalTransferDispatchRepository } from "../infrastructure/bank-external-transfer-dispatch.repository";
import { BankExternalTransferRepository } from "../infrastructure/bank-external-transfer.repository";

/** KCB's Funds Transfer path on the API gateway (API definition `FundsTransferAPIService` 1.0.0, `POST /api/v1/transfer`). */
const FUNDS_TRANSFER_PATH = "/fundstransfer/1.0.0/api/v1/transfer";
/** KCB's field limits for this API. */
const MAX_ACCOUNT_NUMBER = 10;
const MAX_TEXT = 35;
const POSTGRES_UNIQUE_VIOLATION = "23505";

export interface DispatchOverrides {
  /** KCB `transactionType` (2 chars). Defaults to the KCB settings' `fundsTransferType` (their example: `IF`). */
  transactionType?: string;
  /** KCB `beneficiaryBankCode` — only needed when the beneficiary banks elsewhere. */
  beneficiaryBankCode?: string;
}

export interface ResolveDispatchInput {
  outcome: "SENT" | "FAILED";
  /** Required: what the person found out, and how. */
  note: string;
  /** The bank's own transaction id, when they have it. */
  bankRef?: string;
}

/**
 * Actually SENDS an approved external bank transfer through KCB's Funds Transfer API. This moves real money, so every
 * step errs toward doing nothing:
 *
 *  - **Deliberate**: only an explicit call (a person with `banking:external-transfer:dispatch`) sends anything — an
 *    approval or a posting never does, and the KCB setting `fundsTransferEnabled` must be switched on.
 *  - **Already authorized**: the transfer must be `APPROVED` (or already `POSTED`) — i.e. it has been through the
 *    ERP's maker-checker approval.
 *  - **One attempt at a time**: the attempt is written to `bank_external_transfer_dispatch` and committed BEFORE the
 *    bank is called, and the database allows only one live attempt per transfer. A double click, a second person or a
 *    retry cannot pay it twice.
 *  - **No blind retries**: the call is made once. What happens next depends on whether the bank can have acted:
 *      refused or never reached (HTTP 4xx, a business "no")        -> FAILED  (safe to try again)
 *      accepted                                                    -> SENT
 *      no usable answer (timeout, 5xx, unreadable reply)           -> UNKNOWN (it MAY have paid; a person checks
 *                                                                              with KCB using the reference and
 *                                                                              resolves it — never auto-retried)
 *  - **Traceable**: the exact request and the bank's exact reply are kept, with the 12-character reference to quote
 *    to the bank.
 */
@Injectable()
export class BankTransferDispatchService {
  private readonly logger = new Logger(BankTransferDispatchService.name);

  constructor(
    private readonly transferRepository: BankExternalTransferRepository,
    private readonly accountRepository: BankAccountRepository,
    private readonly dispatchRepository: BankExternalTransferDispatchRepository,
    private readonly kcbResolver: KcbBuniConfigResolverService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async listForTransfer(transferId: string): Promise<BankExternalTransferDispatchEntity[]> {
    await this.transferRepository.findByIdOrFail(transferId);
    return this.dispatchRepository.listForTransfer(transferId);
  }

  async dispatch(transferId: string, actorId: string, overrides: DispatchOverrides = {}): Promise<BankExternalTransferDispatchEntity> {
    const kcb = await this.kcbResolver.resolve();
    if (!kcb) throw new ValidationException("KCB BUNI is not set up: add it in Settings → Integrations first");
    if (!kcb.config.fundsTransferEnabled) {
      throw new ValidationException("Sending money through KCB is switched off. Turn on 'Allow sending money (Funds Transfer)' in the KCB integration settings first.");
    }
    if (!kcb.config.companyCode) {
      throw new ValidationException("KCB Funds Transfer needs the school's company code (companyCode) in the KCB integration settings");
    }

    // ---- 1. validate, then record the attempt (committed BEFORE the bank is called) ----
    const attempt = await this.recordAttempt(transferId, actorId, kcb, overrides);

    // ---- 2. call the bank ONCE ----
    let outcome: { status: BankDispatchStatus; response: Record<string, unknown> | null; bankRef: string | null; note: string | null };
    try {
      const response = await this.createClient(kcb).postJson(FUNDS_TRANSFER_PATH, attempt.request);
      outcome = interpret(response, attempt.reference);
    } catch (error) {
      // No answer at all (timeout, connection dropped): the bank may or may not have received it.
      outcome = {
        status: "UNKNOWN",
        response: null,
        bankRef: null,
        note: `No answer from KCB (${error instanceof Error ? error.message : String(error)}). The payment MAY have gone through — do not send it again. Ask KCB about reference ${attempt.reference}, then resolve this attempt.`,
      };
    }
    if (outcome.status !== "SENT") {
      this.logger.warn(`Funds Transfer ${attempt.reference} for transfer ${transferId} ended ${outcome.status}: ${outcome.note ?? ""}`);
    }

    // ---- 3. record what happened ----
    return runInTransaction(this.dataSource, async (em) => {
      const row = await this.dispatchRepository.findByIdOrFail(attempt.id, em);
      row.status = outcome.status;
      row.response = outcome.response;
      row.bankRef = outcome.bankRef;
      row.note = outcome.note;
      row.updatedBy = actorId;
      return this.dispatchRepository.save(row, em);
    });
  }

  /**
   * A person settles an attempt whose outcome we could not learn (UNKNOWN, or a PENDING one left behind by a crash)
   * after checking with the bank. `SENT` = the bank did pay; `FAILED` = it did not, so a new attempt is allowed.
   */
  async resolve(dispatchId: string, input: ResolveDispatchInput, actorId: string): Promise<BankExternalTransferDispatchEntity> {
    const note = input.note?.trim();
    if (!note) throw new ValidationException("Say what you found out and how (for example: 'KCB confirmed it was paid, ref FT123') — a note is required");

    return runInTransaction(this.dataSource, async (em) => {
      const row = await this.dispatchRepository.findByIdOrFail(dispatchId, em);
      if (row.status !== "UNKNOWN" && row.status !== "PENDING") {
        throw new ValidationException(`Only an attempt with an unknown outcome can be resolved by hand (this one is ${row.status})`);
      }
      row.status = input.outcome;
      if (input.bankRef?.trim()) row.bankRef = input.bankRef.trim().slice(0, 60);
      row.note = `Resolved by hand as ${input.outcome}: ${note}${row.note ? ` — earlier note: ${row.note}` : ""}`;
      row.updatedBy = actorId;
      return this.dispatchRepository.save(row, em);
    });
  }

  /** Seam for tests; production builds the real client. */
  protected createClient(kcb: ResolvedKcbBuni): Pick<KcbBuniApiClient, "postJson"> {
    return new KcbBuniApiClient(kcb.config, kcb.tokenProvider);
  }

  /** Validates the transfer and writes its PENDING attempt in one transaction. */
  private async recordAttempt(
    transferId: string,
    actorId: string,
    kcb: ResolvedKcbBuni,
    overrides: DispatchOverrides,
  ): Promise<BankExternalTransferDispatchEntity> {
    for (let tries = 0; ; tries++) {
      try {
        return await runInTransaction(this.dataSource, async (em) => {
          const transfer = await this.transferRepository.findByIdOrFail(transferId, em);
          if (transfer.status !== "APPROVED" && transfer.status !== "POSTED") {
            throw new ValidationException(`Only an approved transfer can be sent (this one is ${transfer.status}). Get it approved first.`);
          }
          const source = await this.accountRepository.findByIdOrFail(transfer.sourceAccountId, em);

          const debitAccount = (source.accountNo ?? "").trim();
          if (!debitAccount) throw new ValidationException(`The source bank account "${source.name}" has no account number — add it first`);
          if (debitAccount.length > MAX_ACCOUNT_NUMBER) {
            throw new ValidationException(`KCB Funds Transfer accepts account numbers of up to ${MAX_ACCOUNT_NUMBER} characters; "${source.name}" has ${debitAccount.length}`);
          }
          const creditAccount = transfer.beneficiaryAccountNo.trim();
          if (creditAccount.length > MAX_ACCOUNT_NUMBER) {
            throw new ValidationException(`KCB Funds Transfer accepts account numbers of up to ${MAX_ACCOUNT_NUMBER} characters; the beneficiary's has ${creditAccount.length}`);
          }
          const debitAmount = toKcbAmount(transfer.amount);

          const id = generateUuidV7();
          const reference = `FT${id.replace(/-/g, "").slice(-10)}`.toUpperCase();
          const request: Record<string, unknown> = {
            companyCode: kcb.config.companyCode,
            transactionType: (overrides.transactionType?.trim() || kcb.config.fundsTransferType).slice(0, 2),
            debitAccountNumber: debitAccount,
            creditAccountNumber: creditAccount,
            debitAmount,
            paymentDetails: (transfer.referenceNo?.trim() || transfer.number).slice(0, MAX_TEXT),
            transactionReference: reference,
            currency: "KES",
            beneficiaryDetails: transfer.beneficiaryName.slice(0, MAX_TEXT),
            ...(overrides.beneficiaryBankCode?.trim() ? { beneficiaryBankCode: overrides.beneficiaryBankCode.trim().slice(0, 20) } : {}),
          };

          return this.dispatchRepository.create(
            { id, transferId, provider: "KCB", reference, status: "PENDING", amount: transfer.amount, request, response: null, bankRef: null, note: null, createdBy: actorId, updatedBy: actorId },
            em,
          );
        });
      } catch (error) {
        const code = (error as { code?: string; driverError?: { code?: string } }).code ?? (error as { driverError?: { code?: string } }).driverError?.code;
        if (code !== POSTGRES_UNIQUE_VIOLATION) throw error;
        const detail = `${(error as { detail?: string }).detail ?? ""} ${(error as { driverError?: { constraint?: string } }).driverError?.constraint ?? ""} ${(error as { constraint?: string }).constraint ?? ""}`;
        if (detail.includes("uq_bank_ext_transfer_dispatch_ref") && tries < 3) continue; // astronomically unlikely reference clash: draw another
        throw new ConflictException("This transfer already has a payment in progress, sent, or awaiting resolution — it cannot be sent again");
      }
    }
  }
}

/** KCB wants `debitAmount` as a JSON number; refuse anything a float could misstate (more than cents). */
function toKcbAmount(amount: Money): number {
  const text = amount.toDecimalString();
  const [, fraction = ""] = text.split(".");
  if (/[^0]/.test(fraction.slice(2))) throw new ValidationException(`KCB Funds Transfer takes amounts to the cent; ${text} has finer decimals`);
  return Number(text);
}

/**
 * What KCB's answer means for the money. Only "it definitely did not act" outcomes are FAILED; anything we cannot be
 * sure about is UNKNOWN, because treating an unknown payment as failed invites a double payment.
 */
function interpret(response: KcbApiResponse, reference: string): { status: BankDispatchStatus; response: Record<string, unknown> | null; bankRef: string | null; note: string | null } {
  const { status, json } = response;
  const header = typeof json?.header === "object" && json.header !== null ? (json.header as Record<string, unknown>) : undefined;

  if (status >= 200 && status < 300 && header) {
    const bankRef = typeof header.retrievalRefNumber === "string" ? header.retrievalRefNumber.slice(0, 60) : null;
    if (String(header.statusCode) === "0") return { status: "SENT", response: json, bankRef, note: null };
    // A definite business refusal ("insufficient funds", "invalid account"): nothing was paid.
    return { status: "FAILED", response: json, bankRef, note: `KCB did not accept the transfer: ${describeKcbFailure(response)}` };
  }
  if (status >= 400 && status < 500) {
    // Refused at the gateway or by validation, before any payment: safe to try again once fixed.
    return { status: "FAILED", response: json, bankRef: null, note: `KCB refused the request: ${describeKcbFailure(response)}` };
  }
  return {
    status: "UNKNOWN",
    response: json,
    bankRef: null,
    note: `KCB gave no usable answer (HTTP ${status}). The payment MAY have gone through — do not send it again. Ask KCB about reference ${reference}, then resolve this attempt.`,
  };
}
