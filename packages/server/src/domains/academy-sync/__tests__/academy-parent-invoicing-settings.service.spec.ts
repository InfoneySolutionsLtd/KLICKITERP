/* eslint-disable @typescript-eslint/no-explicit-any */
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { AcademyParentInvoicingSettingsService } from "../application/academy-parent-invoicing-settings.service";

const ROLE_A = "r0000000-0000-4000-8000-000000000001";
const ROLE_B = "r0000000-0000-4000-8000-000000000002";

function harness(over: { connected?: boolean; publishing?: boolean; enabled?: boolean; roles?: string[]; existingRoles?: string[]; issues?: string[] } = {}) {
  const state = {
    parentInvoicingEnabled: over.enabled ?? false,
    publishInvoicesEnabled: over.publishing ?? true,
    parentInvoiceNotifyRoleIds: over.roles ?? [],
    updatedBy: null as string | null,
  };
  const academyLink = { getConnection: jest.fn(async () => (over.connected === false ? null : { schoolCode: "KAS-2414" })) };
  const stateRepository = { getOrCreate: jest.fn(async () => state), save: jest.fn(async (s: unknown) => s) };
  const requests = { existingRoleIds: jest.fn(async (ids: string[]) => over.existingRoles ?? ids) };
  const parentInvoices = { readiness: jest.fn(async () => ({ issues: over.issues ?? [] })) };
  const service = new AcademyParentInvoicingSettingsService(academyLink as any, stateRepository as any, requests as any, parentInvoices as any);
  return { service, state, stateRepository, requests, parentInvoices };
}

describe("AcademyParentInvoicingSettingsService", () => {
  it("is off by default and reports what is missing", async () => {
    const h = harness({ issues: ["NO_SYSTEM_USER"] });
    expect(await h.service.getStatus()).toEqual({ enabled: false, publishingOn: true, notifyRoleIds: [], issues: ["NO_SYSTEM_USER"] });
  });

  it("switches on when the ERP is connected and publishing is on, remembers who did it, and saves the notification roles", async () => {
    const h = harness();
    const status = await h.service.update({ enabled: true, notifyRoleIds: [ROLE_A, ROLE_B, ROLE_A] }, "admin-1");
    expect(h.state.parentInvoicingEnabled).toBe(true);
    expect(h.state.parentInvoiceNotifyRoleIds).toEqual([ROLE_A, ROLE_B]); // de-duplicated
    expect(h.state.updatedBy).toBe("admin-1");
    expect(h.stateRepository.save).toHaveBeenCalledTimes(1);
    expect(status.enabled).toBe(true);
  });

  it("refuses to switch on while the ERP is not connected to an Academy school", async () => {
    const h = harness({ connected: false });
    await expect(h.service.update({ enabled: true }, "admin-1")).rejects.toBeInstanceOf(ValidationException);
    expect(h.stateRepository.save).not.toHaveBeenCalled();
  });

  it("refuses to switch on while invoices are not published to the portal (a parent would never see what they made)", async () => {
    const h = harness({ publishing: false });
    await expect(h.service.update({ enabled: true }, "admin-1")).rejects.toThrow(/Invoices in the parent portal/);
    expect(h.state.parentInvoicingEnabled).toBe(false);
  });

  it("can always be switched off, even when not connected", async () => {
    const h = harness({ connected: false, publishing: false, enabled: true });
    const status = await h.service.update({ enabled: false }, "admin-1");
    expect(status.enabled).toBe(false);
  });

  it("refuses a role that does not exist, and saves nothing", async () => {
    const h = harness({ existingRoles: [ROLE_A] });
    await expect(h.service.update({ enabled: false, notifyRoleIds: [ROLE_A, ROLE_B] }, "admin-1")).rejects.toThrow(/role/i);
    expect(h.stateRepository.save).not.toHaveBeenCalled();
  });

  it("leaves the notification roles alone when none are sent, and clears them (back to 'everyone who can post invoices') when [] is sent", async () => {
    const keep = harness({ roles: [ROLE_A] });
    await keep.service.update({ enabled: false }, "admin-1");
    expect(keep.state.parentInvoiceNotifyRoleIds).toEqual([ROLE_A]);

    const clear = harness({ roles: [ROLE_A] });
    await clear.service.update({ enabled: false, notifyRoleIds: [] }, "admin-1");
    expect(clear.state.parentInvoiceNotifyRoleIds).toEqual([]);
  });
});
