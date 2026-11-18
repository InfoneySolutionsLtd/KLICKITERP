import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { SettingsService } from "../../../platform/settings";
import { runInTransaction } from "../../../shared/database/tx";
import { ConflictException } from "../../../shared/exceptions/conflict.exception";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { Money } from "../../../shared/money/money";
import { MPESA_SYSTEM_ACTOR_SETTING_KEY, MpesaAdapterResolverService, MpesaLogOnlyAdapter, MpesaService } from "../../payments";
import { AcadPaymentRequestRepository, type PaymentRequestRow } from "../infrastructure/acad-payment-request.repository";
import {
  deriveView,
  isWholeShillings,
  MAX_PORTAL_PAYMENT_KES,
  sumMoney,
  toStkMsisdn,
  WAITING_PROMPT_SECONDS,
  type PaymentRequestView,
} from "./academy-payment.util";

export interface CreatePaymentRequestInput {
  /** The Academy's own id for this request — what makes the call safe to repeat. */
  requestId: string;
  academyStudentId: string;
  /** Decimal string, whole shillings. */
  amount: string;
  /** The parent's M-Pesa number, any common Kenyan format. */
  phone: string;
  /** ERP invoice ids the parent chose to pay toward; omitted = the learner's open invoices, oldest first. */
  invoiceIds?: string[];
}

/** Why a request is turned down BEFORE any prompt is sent. The wording is for a parent. */
const REFUSALS = {
  STUDENT_NOT_LINKED: "This learner is not set up for online payments at the school yet. Please contact the school office.",
  NOTHING_TO_PAY: "There is nothing owing on this learner's invoices right now.",
  INVOICE_NOT_PAYABLE: "One of the chosen invoices cannot be paid right now. Please refresh and try again.",
  AMOUNT_TOO_HIGH: "That is more than is owing. Please choose an amount up to the balance shown.",
  ALREADY_WAITING: "A payment request for this learner is already waiting on a phone. Please finish or wait a few minutes before trying again.",
  NOT_CONFIGURED: "The school has not finished setting up M-Pesa payments. Please contact the school office.",
  PROVIDER_ERROR: "We could not send the M-Pesa request just now. Please try again in a moment.",
} as const;

type RefusalCode = keyof typeof REFUSALS;

/**
 * "Pay these invoices" — the Academy parent portal asks the ERP to send the parent an M-Pesa prompt.
 *
 * The ERP stays the only place money is recorded. This service does not touch a balance or a receipt: it checks the
 * request against the live books, hands it to the existing `MpesaService.initiateStk`, and links the two. When the parent
 * confirms on their phone the existing callback captures the receipt exactly as it does for a cashier-started prompt, and
 * Phase B's publisher then carries the new balance back to the portal.
 *
 * Safety, in the order it matters:
 *  - **No second prompt for the same request**: the Academy's request id is recorded FIRST (unique); a retry or a double
 *    tap finds it and just reports on it.
 *  - **No prompt unless every check passes**, and every refusal is recorded so a replay answers the same.
 *  - **Never more than is owing** (checked in exact decimal arithmetic against the live balances), never more than one
 *    M-Pesa prompt can carry, whole shillings only (the parent is charged exactly what they saw).
 *  - **Never pretends**: with no real M-Pesa provider configured (the log-only fallback) or no system cashier set, the
 *    request is refused rather than telling a parent to "check your phone" when nothing was sent.
 *  - **One prompt at a time per learner**: while an earlier prompt for the same learner is still open, a new one is refused.
 *
 * Who is allowed to ask for which learner is the Academy's job (it only ever asks for a child of the signed-in parent);
 * this ERP trusts the signed call and checks the money.
 */
@Injectable()
export class AcademyPaymentRequestService {
  private readonly logger = new Logger(AcademyPaymentRequestService.name);

  constructor(
    private readonly repository: AcadPaymentRequestRepository,
    private readonly mpesaService: MpesaService,
    private readonly adapterResolver: MpesaAdapterResolverService,
    private readonly settingsService: SettingsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async create(input: CreatePaymentRequestInput): Promise<PaymentRequestView> {
    const msisdn = toStkMsisdn(input.phone);
    if (!msisdn) {
      throw new ValidationException("phone must be a Kenyan mobile number, e.g. 0712 345 678");
    }
    const amount = Money.fromDecimalString(input.amount);
    if (!amount.isPositive() || !isWholeShillings(amount)) {
      throw new ValidationException("amount must be a whole number of shillings greater than zero");
    }
    if (amount.compare(Money.fromInt(MAX_PORTAL_PAYMENT_KES)) > 0) {
      throw new ValidationException(`amount cannot be more than KES ${MAX_PORTAL_PAYMENT_KES.toLocaleString("en-KE")} in one payment`);
    }
    const invoiceIds = input.invoiceIds && input.invoiceIds.length > 0 ? [...new Set(input.invoiceIds)] : null;

    const { inserted, row } = await this.repository.insertReceived({
      academyRequestId: input.requestId,
      academyStudentId: input.academyStudentId,
      amount: amount.toDecimalString(),
      msisdnMasked: `${msisdn.slice(0, 3)}${"*".repeat(msisdn.length - 6)}${msisdn.slice(-3)}`,
      invoiceIds,
    });

    if (!inserted) {
      // A repeat of a request we already have. Same request -> report on it; a DIFFERENT request under the same id is a bug
      // or tampering on the caller's side, so it is refused outright rather than silently answered.
      if (row.academyStudentId !== input.academyStudentId || !Money.fromDecimalString(row.amount).equals(amount)) {
        throw new ConflictException("This payment request id was already used for a different request");
      }
      return this.getStatus(input.requestId);
    }

    const refusal = await this.check(row, amount, invoiceIds);
    if ("code" in refusal) {
      await this.repository.markRefused(row.id, refusal.code, REFUSALS[refusal.code], refusal.studentId);
      return this.getStatus(input.requestId);
    }

    try {
      await runInTransaction(this.dataSource, async (em) => {
        const transaction = await this.mpesaService.initiateStk(
          em,
          {
            studentId: refusal.studentId,
            amountKes: amount,
            msisdn,
            accountRef: refusal.admissionNo,
            invoiceIds: invoiceIds ?? undefined,
          },
          refusal.actorUserId,
        );
        await this.repository.markSent(row.id, refusal.studentId, transaction.id, em);
      });
    } catch (error) {
      // The provider's own error text never reaches a parent; it is logged for the school's administrator.
      this.logger.error(`Academy payment request ${input.requestId}: the M-Pesa prompt could not be sent: ${(error as Error).message}`);
      await this.repository.markRefused(row.id, "PROVIDER_ERROR", REFUSALS.PROVIDER_ERROR, refusal.studentId);
    }
    return this.getStatus(input.requestId);
  }

  async getStatus(academyRequestId: string): Promise<PaymentRequestView> {
    const row = await this.repository.findStatusRow(academyRequestId);
    if (!row) {
      throw new NotFoundException("AcademyPaymentRequest", academyRequestId);
    }
    return deriveView(row, new Date());
  }

  /** Every reason to say no, cheapest first. Resolves to what the prompt needs, or the reason it is refused. */
  private async check(
    row: PaymentRequestRow,
    amount: Money,
    invoiceIds: string[] | null,
  ): Promise<{ code: RefusalCode; studentId: string | null } | { studentId: string; admissionNo: string; actorUserId: string }> {
    const link = await this.repository.findStudentLink(row.academyStudentId);
    if (!link) {
      return { code: "STUDENT_NOT_LINKED", studentId: null };
    }

    const invoices = await this.repository.findPayableInvoices(link.studentId, invoiceIds);
    if (invoiceIds && invoices.length !== invoiceIds.length) {
      return { code: "INVOICE_NOT_PAYABLE", studentId: link.studentId };
    }
    if (invoices.length === 0) {
      return { code: "NOTHING_TO_PAY", studentId: link.studentId };
    }
    const owing = sumMoney(invoices.map((invoice) => Money.fromDecimalString(invoice.balance)));
    if (amount.compare(owing) > 0) {
      return { code: "AMOUNT_TOO_HIGH", studentId: link.studentId };
    }

    if (await this.repository.hasWaitingPrompt(link.studentId, WAITING_PROMPT_SECONDS, row.id)) {
      return { code: "ALREADY_WAITING", studentId: link.studentId };
    }

    const actorUserId = await this.settingsService.getTyped<string | null>(MPESA_SYSTEM_ACTOR_SETTING_KEY, null);
    const provider = await this.adapterResolver.resolve();
    if (!actorUserId || provider instanceof MpesaLogOnlyAdapter) {
      return { code: "NOT_CONFIGURED", studentId: link.studentId };
    }
    return { studentId: link.studentId, admissionNo: link.admissionNo, actorUserId };
  }
}
