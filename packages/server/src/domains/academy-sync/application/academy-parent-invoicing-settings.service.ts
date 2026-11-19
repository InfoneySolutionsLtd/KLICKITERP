import { Inject, Injectable } from "@nestjs/common";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { ACADEMY_LINK_PORT } from "../../../shared/integrations/academy/academy-link.port";
import type { AcademyLinkPort } from "../../../shared/integrations/academy/academy-link.port";
import { AcadParentInvoiceRequestRepository } from "../infrastructure/acad-parent-invoice-request.repository";
import { AcadSyncStateRepository } from "../infrastructure/acad-sync-state.repository";
import { AcademyParentInvoiceService, type ParentInvoicingReadiness } from "./academy-parent-invoice.service";

export interface ParentInvoicingStatus {
  enabled: boolean;
  publishingOn: boolean;
  notifyRoleIds: string[];
  issues: ParentInvoicingReadiness["issues"];
}

/**
 * The school's switch for "parents customise and generate their own fee invoices", and who is told when one does.
 * Off by default. It cannot be switched on before the ERP is connected to its Academy school and invoices are being
 * published to the portal, because a parent could otherwise create an invoice they would never see.
 */
@Injectable()
export class AcademyParentInvoicingSettingsService {
  constructor(
    @Inject(ACADEMY_LINK_PORT) private readonly academyLink: AcademyLinkPort,
    private readonly stateRepository: AcadSyncStateRepository,
    private readonly requests: AcadParentInvoiceRequestRepository,
    private readonly parentInvoices: AcademyParentInvoiceService,
  ) {}

  async getStatus(): Promise<ParentInvoicingStatus> {
    const [connection, state] = await Promise.all([this.academyLink.getConnection(), this.stateRepository.getOrCreate()]);
    const readiness = await this.parentInvoices.readiness(connection !== null);
    return {
      enabled: state.parentInvoicingEnabled,
      publishingOn: state.publishInvoicesEnabled,
      notifyRoleIds: state.parentInvoiceNotifyRoleIds,
      issues: readiness.issues,
    };
  }

  async update(input: { enabled: boolean; notifyRoleIds?: string[] }, actorId: string | null): Promise<ParentInvoicingStatus> {
    const state = await this.stateRepository.getOrCreate();

    if (input.notifyRoleIds !== undefined) {
      const wanted = [...new Set(input.notifyRoleIds)];
      const existing = new Set(await this.requests.existingRoleIds(wanted));
      if (wanted.some((id) => !existing.has(id))) {
        throw new ValidationException("One of the chosen roles does not exist any more. Please refresh and choose again.");
      }
      state.parentInvoiceNotifyRoleIds = wanted;
    }

    if (input.enabled) {
      if (!(await this.academyLink.getConnection())) {
        throw new ValidationException("This ERP is not connected to a Klickit Academy school yet. Connect it on the Licence page first.");
      }
      if (!state.publishInvoicesEnabled) {
        throw new ValidationException('Switch on "Invoices in the parent portal" first: parents can only see invoices that are published to the portal.');
      }
    }
    state.parentInvoicingEnabled = input.enabled;
    state.updatedBy = actorId;
    await this.stateRepository.save(state);
    return this.getStatus();
  }
}
