import { Injectable, Logger } from "@nestjs/common";
import { SettingsService } from "../../../platform/settings";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { MPESA_SYSTEM_ACTOR_SETTING_KEY, MpesaAdapterResolverService, MpesaLogOnlyAdapter } from "../../payments";
import { AcadParentInvoiceRequestRepository } from "../infrastructure/acad-parent-invoice-request.repository";
import { AcademySetupFactsRepository } from "../infrastructure/academy-setup-facts.repository";
import { AcademyLinkService } from "./academy-link.service";
import { AcademyParentInvoicingSettingsService } from "./academy-parent-invoicing-settings.service";
import { AcademyPublishService } from "./academy-publish.service";
import { AcademyReceiptService } from "./academy-receipt.service";
import { AcademySyncService } from "./academy-sync.service";
import { buildSetupGuide, type SetupGuide } from "./academy-setup-guide.util";

/** The user receipts made from parent M-Pesa payments are recorded under (the existing `payments.mpesa_system_actor_user_id`). */
export interface PaymentsCashierStatus {
  /** True when a user is set AND is active. */
  configured: boolean;
  userId: string | null;
  userName: string | null;
  /** False when a user id is saved but that user is missing or not active. */
  userActive: boolean;
}

export interface SetupGuideView extends SetupGuide {
  payments: {
    /** A real M-Pesa provider is set up (not the log-only fallback that sends nothing). */
    providerConfigured: boolean;
    cashier: PaymentsCashierStatus;
  };
}

/**
 * The guided configuration of the Klickit Academy link, for the Licence page: every step, whether it is done, what it needs, and
 * which step to do next.
 *
 * It only READS what the other parts of this module already know (the connection, the student import, the registered address,
 * publishing, receipt readiness, parent invoicing) plus a few facts from the rest of the ERP (the M-Pesa provider and cashier, the
 * academic calendar, fee structures, transport routes). Nothing is stored, so it cannot drift from reality. The one thing it can
 * write is the M-Pesa system cashier, because that setting had no screen anywhere.
 */
@Injectable()
export class AcademySetupGuideService {
  private readonly logger = new Logger(AcademySetupGuideService.name);

  constructor(
    private readonly syncService: AcademySyncService,
    private readonly linkService: AcademyLinkService,
    private readonly publishService: AcademyPublishService,
    private readonly receiptService: AcademyReceiptService,
    private readonly parentInvoicing: AcademyParentInvoicingSettingsService,
    private readonly adapterResolver: MpesaAdapterResolverService,
    private readonly settingsService: SettingsService,
    private readonly facts: AcademySetupFactsRepository,
    private readonly users: AcadParentInvoiceRequestRepository,
  ) {}

  async getGuide(): Promise<SetupGuideView> {
    const [sync, link, publish, receipts, parent, providerConfigured, cashier, feeOptions] = await Promise.all([
      this.syncService.getStatus(),
      this.linkService.getStatus(),
      this.publishService.getStatus(),
      this.receiptService.readiness().catch((error: unknown) => {
        // Not being able to look at the receipt setup must not blank the whole guide: that one step says "could not check".
        this.logger.warn(`Setup guide: receipt readiness could not be checked: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }),
      this.parentInvoicing.getStatus(),
      this.isProviderConfigured(),
      this.cashierStatus(),
      this.facts.feeOptionFacts(),
    ]);

    const guide = buildSetupGuide({
      connected: sync.connected,
      firstImportConfirmed: sync.state.firstImportConfirmedAt !== null,
      mappedStudents: sync.mappedStudents,
      link: { registered: link.registered, lastVerifyOk: link.lastVerifyOk },
      publish: { enabled: publish.enabled, lastPublishOk: publish.lastPublishOk, rejected: publish.rejected },
      receipts: receipts ? { canIssue: receipts.canIssue, complete: receipts.complete, issues: receipts.issues } : null,
      payments: { providerConfigured, cashierConfigured: cashier.configured },
      feeOptions,
      parentInvoicing: { enabled: parent.enabled, invoiceUserConfigured: parent.actor.configured },
    });
    return { ...guide, payments: { providerConfigured, cashier } };
  }

  /**
   * Chooses the user the receipts of parent M-Pesa payments are recorded under. Checked before anything is saved (the user must
   * exist and be ACTIVE, named in the message when not), so a refused choice changes nothing.
   */
  async setPaymentsCashier(userId: string, actorId: string | null): Promise<SetupGuideView> {
    const user = await this.users.findUserBrief(userId);
    if (!user) throw new ValidationException("That user does not exist.");
    if (user.status !== "ACTIVE") {
      throw new ValidationException(`${user.fullName} is not an active user (status ${user.status}): please pick an active one.`);
    }
    await this.settingsService.set(MPESA_SYSTEM_ACTOR_SETTING_KEY, userId, false, actorId);
    return this.getGuide();
  }

  /** A real M-Pesa provider (Daraja or KCB) is configured, as opposed to the log-only fallback that sends nothing. */
  private async isProviderConfigured(): Promise<boolean> {
    try {
      return !((await this.adapterResolver.resolve()) instanceof MpesaLogOnlyAdapter);
    } catch (error) {
      this.logger.warn(`Setup guide: the M-Pesa provider could not be resolved: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private async cashierStatus(): Promise<PaymentsCashierStatus> {
    const userId = await this.settingsService.getTyped<string | null>(MPESA_SYSTEM_ACTOR_SETTING_KEY, null);
    if (!userId) return { configured: false, userId: null, userName: null, userActive: false };
    const user = await this.users.findUserBrief(userId);
    const active = user?.status === "ACTIVE";
    return { configured: active, userId, userName: user?.fullName ?? null, userActive: active };
  }
}
