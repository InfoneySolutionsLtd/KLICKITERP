import { Injectable } from "@nestjs/common";
import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { describeReceiptAllocation, describeReceiptMethod, ReceiptPdfService, type ReceiptSetupReadiness } from "../../payments";
import { AcademyReceiptRepository, MAX_RECEIPTS_PER_ANSWER } from "../infrastructure/academy-receipt.repository";

export const DEFAULT_RECEIPTS_PER_ANSWER = 50;

/**
 * The public web origin to use for a receipt's QR code when `WEB_APP_URL` is not a real address: the origin of the address this
 * ERP registered with the Academy (`https://erp.school.example/api/v1` -> `https://erp.school.example`). The web app and the API
 * share an origin in the standard deployment. Null when it has not registered or the address is unusable.
 */
export function webOriginOf(registeredBaseUrl: string | null): string | null {
  if (!registeredBaseUrl) return null;
  try {
    return new URL(registeredBaseUrl).origin;
  } catch {
    return null;
  }
}

/** One receipt as the parent portal shows it. No cashier, no phone number, no internal ids beyond the receipt's own. */
export interface AcademyReceiptView {
  /** Opaque to the portal; it is only ever handed back with the learner it came with. */
  id: string;
  number: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Decimal string, 4 places. */
  amount: string;
  currency: "KES";
  /** `VALID`, or `REVERSED` when the school has reversed it (it no longer counts as a payment). */
  status: "VALID" | "REVERSED";
  methods: Array<{ label: string; reference: string | null }>;
  appliedTo: Array<{ label: string; amount: string }>;
}

export interface AcademyReceiptList {
  receipts: AcademyReceiptView[];
}

/**
 * Receipts for the Academy parent portal: the list of a learner's receipts, and one receipt as a PDF.
 *
 * Read-only, and read from the school's books on every request (nothing is copied to the Academy, so a reversal shows at once,
 * and a payment made at the school office — cash, cheque — appears here like one made from the portal).
 *
 * **A receipt is only ever found through its learner.** The Academy names the learner (it has already checked that the learner
 * is the signed-in parent's own child); this service answers only about receipts of THAT learner, and asks for the PDF only
 * after confirming the receipt is that learner's. A learner the ERP has not linked, a receipt that belongs to someone else, a
 * reversal's contra-receipt and a receipt that does not exist are all the same not-found.
 */
@Injectable()
export class AcademyReceiptService {
  constructor(
    private readonly repository: AcademyReceiptRepository,
    private readonly receiptPdf: ReceiptPdfService,
  ) {}

  async list(academyStudentId: string, limit = DEFAULT_RECEIPTS_PER_ANSWER): Promise<AcademyReceiptList> {
    if (!(await this.repository.isLinked(academyStudentId))) {
      throw new NotFoundException("AcademyStudent", academyStudentId);
    }
    const heads = await this.repository.findForStudent(academyStudentId, Math.min(limit, MAX_RECEIPTS_PER_ANSWER));
    const ids = heads.map((head) => head.id);
    const [splits, allocations] = await Promise.all([this.repository.findSplits(ids), this.repository.findAllocations(ids)]);

    return {
      receipts: heads.map((head) => ({
        id: head.id,
        number: head.number,
        date: head.date,
        amount: head.amount,
        currency: "KES",
        status: head.status === "REVERSED" ? "REVERSED" : "VALID",
        methods: splits.filter((split) => split.receiptId === head.id).map((split) => describeReceiptMethod(split.method, split.externalRef)),
        appliedTo: allocations
          .filter((allocation) => allocation.receiptId === head.id)
          .map((allocation) => ({ label: describeReceiptAllocation(allocation), amount: allocation.amount })),
      })),
    };
  }

  async pdf(academyStudentId: string, receiptId: string): Promise<{ filename: string; buffer: Buffer }> {
    if (!(await this.repository.belongsTo(academyStudentId, receiptId))) {
      throw new NotFoundException("PayReceipt", receiptId);
    }
    return this.receiptPdf.render(receiptId, { fallbackWebUrl: webOriginOf(await this.repository.registeredBaseUrl()) });
  }

  /** What the school still has to set up for its receipts: logo, letterhead text, a public QR address. */
  async readiness(): Promise<ReceiptSetupReadiness> {
    return this.receiptPdf.readiness({ fallbackWebUrl: webOriginOf(await this.repository.registeredBaseUrl()) });
  }
}
