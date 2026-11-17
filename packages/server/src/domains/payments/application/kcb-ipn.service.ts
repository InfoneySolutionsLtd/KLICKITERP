import { timingSafeEqual } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";
import { AppConfigService } from "../../../shared/config/app-config.service";
import { runInTransaction } from "../../../shared/database/tx";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { DomainException } from "../../../shared/exceptions/domain-exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { verifyKcbSignature } from "../../../shared/integrations/kcb-buni/kcb-ipn-signature";
import { KcbBuniConfigResolverService, ResolvedKcbBuni, SettingsService } from "../../../platform/settings";
import { BillInvoiceRepository } from "../../billing";
import { StdStudentRepository } from "../../students";
import { PayBankIpnEntity } from "../domain/pay-bank-ipn.entity";
import { isUniqueViolation, PayBankIpnRepository } from "../infrastructure/pay-bank-ipn.repository";
import { PaySuspenseItemRepository } from "../infrastructure/pay-suspense-item.repository";
import { findStudentByPaymentReference } from "./admission-ref.util";
import { nairobiDate, ParsedBankNotification, parseAccountNotification, parseTillNotification } from "./kcb-ipn.parser";
import { maskMsisdn, MPESA_SYSTEM_ACTOR_SETTING_KEY } from "./mpesa.service";
import { CaptureReceiptSplitInput, ReceiptsService } from "./receipts.service";

/** `usr_user.id` recorded as the capturing cashier of a receipt created from a bank notification (no human is involved). Falls back to the M-Pesa system actor when unset. */
export const BANK_IPN_SYSTEM_ACTOR_SETTING_KEY = "payments.bank_ipn_system_actor_user_id";

/** The ERP cannot accept bank notifications yet — nothing configured (503: the bank should retry later). */
export class BankIpnNotConfiguredException extends DomainException {
  readonly code = "BANK_IPN_NOT_CONFIGURED";
  readonly httpStatus = 503;
}

/** A notification that is genuine but cannot be turned into a receipt automatically — it goes to suspense, never lost. */
class BankIpnUnmatchedError extends Error {}

export interface BankNotificationInput {
  /** The body exactly as received — what KCB's signature was made over. */
  rawBody: Buffer | undefined;
  body: unknown;
  /** The `Signature` request header. */
  signature: string | undefined;
}

/** A validation call also needs the other request headers (the shared-secret mode reads one of them). */
export interface PaymentValidationInput extends BankNotificationInput {
  headers: Record<string, string | string[] | undefined>;
}

/** Response KCB expects for `/account-notification`. */
export interface AccountNotificationAck {
  transactionID: string;
  statusCode: "0";
  statusMessage: string;
}

/** Response KCB expects for `/till-notification`. */
export interface TillNotificationAck {
  header: { messageID: string; originatorConversationID: string; statusCode: "0"; statusMessage: string };
  responsePayload: { transactionInfo: { transactionId: string } };
}

/** Response KCB expects for `/validation`. A business "no" is still HTTP 200, with `statusCode` other than "0". */
export interface PaymentValidationResponse {
  transactionID: string;
  statusCode: "0" | "1";
  statusMessage: string;
  CustomerName?: string;
  billAmount?: string;
  currency?: string;
  billType?: "PARTIAL";
  creditAccountIdentifier?: string;
}

const ACK_MESSAGE = "Notification received successfully";

/**
 * Receives the payment notifications KCB BUNI pushes to the ERP (Instant Payment Notification API) and turns each
 * into money in the ledger — safely:
 *
 *  1. **Authenticate** — KCB signs the body with its private key; we verify with its public key. No valid signature,
 *     no processing (otherwise anyone who learned the callback address could "pay" a student's fees).
 *  2. **Store first** — the notification is written to `pay_bank_ipn` and committed before anything is posted, behind
 *     a unique (provider, kind, bank reference) key. A retry of a notification we already hold changes nothing.
 *  3. **Match and post** — the payer's reference is resolved to a student (same admission-number rules as M-Pesa
 *     C2B) and ONE receipt is captured: `MPESA_TILL` for a Paybill/till payment, `BANK_TRANSFER` (into the configured
 *     school bank account) for an account credit.
 *  4. **Never lose money** — if it cannot be matched or posted (unknown reference, non-KES, no cashier/bank account
 *     configured, a closed period, ...) it is parked in `pay_suspense_item` (BR-PAY-07) with the reason recorded, and
 *     KCB is still told "received". A person resolves it from the existing suspense screen.
 *
 * KCB's optional `/validation` call (a branch or agency teller asking "is this reference real, and whose is it?")
 * answers with a student's name and what they owe, so it is only answered to a caller that proves it is KCB — see
 * `KcbBuniConfig.ipnValidationAuth`.
 */
@Injectable()
export class KcbIpnService {
  private readonly logger = new Logger(KcbIpnService.name);

  constructor(
    private readonly ipnRepository: PayBankIpnRepository,
    private readonly suspenseItemRepository: PaySuspenseItemRepository,
    private readonly receiptsService: ReceiptsService,
    private readonly studentRepository: StdStudentRepository,
    private readonly invoiceRepository: BillInvoiceRepository,
    private readonly settingsService: SettingsService,
    private readonly configResolver: KcbBuniConfigResolverService,
    private readonly appConfig: AppConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async handleAccountNotification(input: BankNotificationInput): Promise<AccountNotificationAck> {
    const resolved = await this.authenticate(input);
    const ipn = await this.receive(parseAccountNotification(input.body), resolved);
    const requestId = (input.body as { requestId?: unknown }).requestId;
    return {
      transactionID: typeof requestId === "string" && requestId ? requestId : ipn.id,
      statusCode: "0",
      statusMessage: ACK_MESSAGE,
    };
  }

  async handleTillNotification(input: BankNotificationInput): Promise<TillNotificationAck> {
    const resolved = await this.authenticate(input);
    const ipn = await this.receive(parseTillNotification(input.body), resolved);
    const header = (input.body as { header?: { messageID?: unknown; originatorConversationID?: unknown } }).header;
    return {
      header: {
        messageID: String(header?.messageID ?? ipn.id),
        originatorConversationID: String(header?.originatorConversationID ?? ""),
        statusCode: "0",
        statusMessage: ACK_MESSAGE,
      },
      responsePayload: { transactionInfo: { transactionId: ipn.id } },
    };
  }

  /**
   * KCB asks, before a teller takes a cash deposit: is this payment reference real, who does it belong to, and what
   * is owed? Unknown reference -> `statusCode "1"` (still HTTP 200). Only answered to a caller that passes the
   * configured authentication — the answer names a student.
   */
  async handleValidation(input: PaymentValidationInput): Promise<PaymentValidationResponse> {
    const resolved = await this.authenticateValidation(input);

    const body = input.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ValidationException("Validation request: the body must be a JSON object");
    }
    const { requestId, customerReference } = body as { requestId?: unknown; customerReference?: unknown };
    const reference = typeof customerReference === "string" || typeof customerReference === "number" ? String(customerReference).trim() : "";
    if (!reference) throw new ValidationException("Validation request: 'customerReference' is required");
    const echoedId = typeof requestId === "string" || typeof requestId === "number" ? String(requestId) : "";

    const student = await findStudentByPaymentReference(this.studentRepository, this.settingsService, reference);
    if (!student) return { transactionID: echoedId, statusCode: "1", statusMessage: "Invalid customer reference" };

    const openInvoices = await this.invoiceRepository.findOpenForStudent(student.id);
    const owed = openInvoices.reduce((sum, invoice) => sum.add(invoice.balance), Money.ZERO);
    return {
      transactionID: echoedId,
      statusCode: "0",
      statusMessage: "Success",
      CustomerName: `${student.firstName} ${student.lastName}`.trim(),
      billAmount: toAmountText(owed),
      currency: "KES",
      // A parent may pay any part of the balance, so the amount is a guide, not a demand.
      billType: "PARTIAL",
      ...(resolved.config.creditAccountNumber ? { creditAccountIdentifier: resolved.config.creditAccountNumber } : {}),
    };
  }

  // ---- 1. authenticate ----

  private async resolveConfig(): Promise<ResolvedKcbBuni> {
    const resolved = await this.configResolver.resolve();
    if (!resolved) {
      throw new BankIpnNotConfiguredException(
        "KCB BUNI is not set up: enable a BANK integration with provider KCB_BUNI in Settings → Integrations",
      );
    }
    return resolved;
  }

  private async authenticate(input: BankNotificationInput): Promise<ResolvedKcbBuni> {
    const resolved = await this.resolveConfig();
    this.checkSignature(resolved, input);
    return resolved;
  }

  /** The signature check shared by the notifications and (in `SIGNATURE` mode) the validation call. */
  private checkSignature(resolved: ResolvedKcbBuni, input: BankNotificationInput): void {
    // The skip flag is a sandbox convenience for the days before KCB's public key is in hand; production ignores it.
    if (resolved.config.ipnSkipSignatureVerification && this.appConfig.nodeEnv !== "production") {
      this.logger.warn("KCB request accepted WITHOUT signature verification (ipnSkipSignatureVerification is on, non-production)");
      return;
    }
    if (!resolved.ipnPublicKey) {
      throw new BankIpnNotConfiguredException("KCB's public key (ipnPublicKeyPem) is not set, so requests cannot be verified");
    }
    if (!input.signature) throw new AuthenticationException("Missing Signature header");
    if (!verifyKcbSignature(resolved.ipnPublicKey, input.signature, input.rawBody, input.body)) {
      this.logger.warn("KCB request rejected: Signature did not verify against the configured KCB public key");
      throw new AuthenticationException("Invalid Signature");
    }
  }

  private async authenticateValidation(input: PaymentValidationInput): Promise<ResolvedKcbBuni> {
    const resolved = await this.resolveConfig();
    const mode = resolved.config.ipnValidationAuth;

    if (mode === "NONE") {
      if (this.appConfig.nodeEnv === "production") {
        // Fail closed: an open validation endpoint in production would hand student names to anyone.
        throw new BankIpnNotConfiguredException("Validation without authentication is not allowed in production");
      }
      this.logger.warn("KCB validation accepted WITHOUT authentication (ipnValidationAuth is NONE, non-production)");
      return resolved;
    }

    if (mode === "SHARED_SECRET") {
      const expected = resolved.config.ipnValidationSecret;
      if (!expected) throw new BankIpnNotConfiguredException("ipnValidationSecret is not set");
      const sent = input.headers[resolved.config.ipnValidationHeader];
      const sentText = Array.isArray(sent) ? sent[0] : sent;
      if (!sentText || !constantTimeEqual(sentText, expected)) {
        this.logger.warn("KCB validation rejected: shared-secret header missing or wrong");
        throw new AuthenticationException("Invalid credentials");
      }
      return resolved;
    }

    this.checkSignature(resolved, input);
    return resolved;
  }

  // ---- 2. store first, 3. match and post, 4. never lose money ----

  private async receive(parsed: ParsedBankNotification, resolved: ResolvedKcbBuni): Promise<PayBankIpnEntity> {
    const stored = await this.store(parsed);
    return stored.state === "RECEIVED" ? this.settle(stored, resolved) : stored;
  }

  /** Writes the notification, or returns the row already holding it (a retry). */
  private async store(parsed: ParsedBankNotification): Promise<PayBankIpnEntity> {
    try {
      return await runInTransaction(this.dataSource, (em) =>
        this.ipnRepository.create(
          {
            provider: "KCB",
            kind: parsed.kind,
            externalRef: parsed.externalRef,
            amount: parsed.amount,
            currency: parsed.currency,
            customerReference: parsed.customerReference,
            payerName: parsed.payerName,
            payerMsisdnMasked: parsed.payerMsisdn ? maskMsisdn(parsed.payerMsisdn) : null,
            narration: parsed.narration,
            creditAccount: parsed.creditAccount,
            tillNumber: parsed.tillNumber,
            transactionAt: parsed.transactionAt,
            state: "RECEIVED",
            receiptId: null,
            suspenseItemId: null,
            note: null,
            raw: parsed.raw,
            createdBy: null,
            updatedBy: null,
          },
          em,
        ),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await this.ipnRepository.findByExternalRef("KCB", parsed.kind, parsed.externalRef);
      if (!existing) throw error;
      if (!existing.amount.equals(parsed.amount)) {
        this.logger.warn(`KCB ${parsed.kind} notification ${parsed.externalRef} was re-sent with a DIFFERENT amount — keeping the first one`);
      }
      this.logger.log(`KCB ${parsed.kind} notification ${parsed.externalRef}: already held (state ${existing.state}) — no second effect`);
      return existing;
    }
  }

  /** Turns a stored notification into a receipt, or — failing that — a suspense item. */
  private async settle(ipn: PayBankIpnEntity, resolved: ResolvedKcbBuni): Promise<PayBankIpnEntity> {
    try {
      return await runInTransaction(this.dataSource, async (em) => {
        const row = await this.ipnRepository.findByExternalRefForUpdate(ipn.provider, ipn.kind, ipn.externalRef, em);
        if (!row || row.state !== "RECEIVED") return row ?? ipn; // another delivery finished it first
        row.receiptId = await this.captureReceiptFor(em, row, resolved);
        row.state = "MATCHED";
        row.note = null;
        return this.ipnRepository.save(row, em);
      });
    } catch (error) {
      const matchingProblem = error instanceof BankIpnUnmatchedError;
      if (!matchingProblem) {
        this.logger.error(
          `KCB ${ipn.kind} notification ${ipn.externalRef}: automatic posting failed, parking it in suspense`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      const reason = matchingProblem ? (error as Error).message : `Automatic posting failed: ${error instanceof Error ? error.message : String(error)}`;
      return this.parkInSuspense(ipn, reason, resolved);
    }
  }

  private async captureReceiptFor(em: EntityManager, row: PayBankIpnEntity, resolved: ResolvedKcbBuni): Promise<string> {
    if (row.currency !== "KES") throw new BankIpnUnmatchedError(`Currency ${row.currency} is not KES`);
    if (!row.customerReference) throw new BankIpnUnmatchedError("The notification carries no customer reference");

    const student = await findStudentByPaymentReference(this.studentRepository, this.settingsService, row.customerReference, em);
    if (!student) throw new BankIpnUnmatchedError(`No student matches the reference "${row.customerReference}"`);

    const cashierId = await this.resolveSystemActorId();

    let split: CaptureReceiptSplitInput;
    if (row.kind === "TILL") {
      split = { method: "MPESA_TILL", amount: row.amount, externalRef: row.externalRef };
    } else {
      if (!resolved.config.bankAccountId) {
        throw new BankIpnUnmatchedError("The school's bank account (bankAccountId) is not set in the KCB integration settings");
      }
      split = { method: "BANK_TRANSFER", amount: row.amount, bankAccountId: resolved.config.bankAccountId, externalRef: row.externalRef };
    }

    const receipt = await this.receiptsService.captureReceipt(em, {
      studentId: student.id,
      payerName: row.payerName ?? `${student.firstName} ${student.lastName}`,
      payerPhone: row.payerMsisdnMasked,
      receiptDate: nairobiDate(row.transactionAt),
      total: row.amount,
      splits: [split],
      cashierId,
      idempotencyKey: `kcb-ipn-${row.kind}-${row.externalRef}`,
    });
    return receipt.id;
  }

  private async parkInSuspense(ipn: PayBankIpnEntity, reason: string, resolved: ResolvedKcbBuni): Promise<PayBankIpnEntity> {
    return runInTransaction(this.dataSource, async (em) => {
      const row = await this.ipnRepository.findByExternalRefForUpdate(ipn.provider, ipn.kind, ipn.externalRef, em);
      if (!row || row.state !== "RECEIVED") return row ?? ipn;

      const item = await this.suspenseItemRepository.create(
        {
          // An M-Pesa Paybill/till payment resolves later as an M-Pesa receipt; an account credit as a bank one.
          source: row.kind === "TILL" ? "C2B" : "BANK",
          amount: row.amount,
          externalRef: row.externalRef,
          // Our own pointers ride along under `klickit` so a later manual match can post to the right bank account.
          raw: { ...row.raw, klickit: { provider: "KCB", kind: row.kind, ipnId: row.id, bankAccountId: resolved.config.bankAccountId ?? null } },
          receivedAt: row.transactionAt,
          state: "OPEN",
          resolvedReceiptId: null,
          resolvedBy: null,
          resolvedAt: null,
          resolutionNote: null,
        },
        em,
      );
      row.suspenseItemId = item.id;
      row.state = "SUSPENDED";
      row.note = reason;
      return this.ipnRepository.save(row, em);
    });
  }

  private async resolveSystemActorId(): Promise<string> {
    const actorId =
      (await this.settingsService.getTyped<string | null>(BANK_IPN_SYSTEM_ACTOR_SETTING_KEY, null)) ??
      (await this.settingsService.getTyped<string | null>(MPESA_SYSTEM_ACTOR_SETTING_KEY, null));
    if (!actorId) {
      throw new BankIpnUnmatchedError(
        `No system cashier is configured: set the Settings key '${BANK_IPN_SYSTEM_ACTOR_SETTING_KEY}' (or '${MPESA_SYSTEM_ACTOR_SETTING_KEY}') ` +
          "to a service-account user id so bank payments can be receipted automatically",
      );
    }
    return actorId;
  }
}

/** `1000.0000` -> `1000.00`; keeps further decimals only when they are really there. */
function toAmountText(amount: Money): string {
  const [whole, fraction = ""] = amount.toDecimalString().split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return `${whole}.${trimmed.padEnd(2, "0")}`;
}

/** Compares two secrets without leaking, through timing, how much of a guess was right. */
function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
