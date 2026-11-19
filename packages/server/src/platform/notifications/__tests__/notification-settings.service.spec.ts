import { NotFoundException } from "../../../shared/exceptions/not-found.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { NOTIFICATION_EVENTS } from "../domain/notification-catalogue";
import { NotificationPreferencesService } from "../application/notification-preferences.service";
import { NotificationSettingsService } from "../application/notification-settings.service";

const ROLE_1 = "r0000000-0000-4000-8000-000000000001";
const ROLE_2 = "r0000000-0000-4000-8000-000000000002";
const USER = "u0000000-0000-4000-8000-00000000000a";

function settingsHarness(stored: Array<{ eventCode: string; isEnabled: boolean; roleIds: string[] }> = []) {
  const rows = new Map(stored.map((row) => [row.eventCode, { ...row }]));
  const repo = {
    list: jest.fn(async () => [...rows.values()]),
    findByCode: jest.fn(async (code: string) => rows.get(code) ?? null),
    upsert: jest.fn(async (code: string, values: { isEnabled: boolean; roleIds: string[] }) => {
      rows.set(code, { eventCode: code, ...values });
      return rows.get(code);
    }),
  };
  const roles = { list: jest.fn(async () => [{ id: ROLE_1 }, { id: ROLE_2 }]) };
  return { service: new NotificationSettingsService(repo as never, roles as never), repo, roles };
}

describe("NotificationSettingsService.list", () => {
  it("lists EVERY catalogue event, on with the default recipients, even when nothing was ever saved", async () => {
    const { service } = settingsHarness();
    const items = await service.list();
    expect(items.map((item) => item.code)).toEqual(NOTIFICATION_EVENTS.map((event) => event.code));
    expect(items.every((item) => item.isEnabled && item.roleIds.length === 0)).toBe(true);
  });

  it("describes each event: category, essential flag, audience, default permissions", async () => {
    const { service } = settingsHarness();
    const items = await service.list();
    const cheque = items.find((item) => item.code === "CHEQUE_BOUNCED");
    expect(cheque).toMatchObject({ category: "MONEY", essentialCategory: false, audienceKind: "permissions", audienceManagedElsewhere: false, defaultPermissions: ["payments:cheque:manage"] });
    const locked = items.find((item) => item.code === "ACCOUNT_LOCKED");
    expect(locked).toMatchObject({ category: "SECURITY", essentialCategory: true });
    const approval = items.find((item) => item.code === "APPROVAL_PENDING");
    expect(approval).toMatchObject({ audienceKind: "explicit", defaultPermissions: [] });
    expect(items.find((item) => item.code === "PARENT_INVOICE_CREATED")?.audienceManagedElsewhere).toBe(true);
  });

  it("shows what the school saved", async () => {
    const { service } = settingsHarness([{ eventCode: "LOW_STOCK", isEnabled: false, roleIds: [ROLE_1] }]);
    expect((await service.list()).find((item) => item.code === "LOW_STOCK")).toMatchObject({ isEnabled: false, roleIds: [ROLE_1] });
  });
});

describe("NotificationSettingsService.update", () => {
  it("switches an event off without touching its roles", async () => {
    const { service, repo } = settingsHarness([{ eventCode: "LOW_STOCK", isEnabled: true, roleIds: [ROLE_1] }]);
    const view = await service.update("LOW_STOCK", { isEnabled: false }, USER);
    expect(repo.upsert).toHaveBeenCalledWith("LOW_STOCK", { isEnabled: false, roleIds: [ROLE_1] }, USER);
    expect(view).toMatchObject({ code: "LOW_STOCK", isEnabled: false, roleIds: [ROLE_1] });
  });

  it("chooses receiving roles (de-duplicated) without changing the on/off", async () => {
    const { service, repo } = settingsHarness();
    await service.update("CHEQUE_BOUNCED", { roleIds: [ROLE_1, ROLE_2, ROLE_1] }, USER);
    expect(repo.upsert).toHaveBeenCalledWith("CHEQUE_BOUNCED", { isEnabled: true, roleIds: [ROLE_1, ROLE_2] }, USER);
  });

  it("an empty list goes back to the default recipients", async () => {
    const { service, repo } = settingsHarness([{ eventCode: "CHEQUE_BOUNCED", isEnabled: true, roleIds: [ROLE_1] }]);
    await service.update("CHEQUE_BOUNCED", { roleIds: [] }, USER);
    expect(repo.upsert).toHaveBeenCalledWith("CHEQUE_BOUNCED", { isEnabled: true, roleIds: [] }, USER);
  });

  it("refuses an event that does not exist", async () => {
    const { service, repo } = settingsHarness();
    await expect(service.update("NOT_AN_EVENT", { isEnabled: false }, USER)).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it("refuses roles that do not exist, saving nothing", async () => {
    const { service, repo } = settingsHarness();
    await expect(service.update("CHEQUE_BOUNCED", { roleIds: ["r0000000-0000-4000-8000-0000000000ff"] }, USER)).rejects.toBeInstanceOf(ValidationException);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it("refuses roles for an event whose audience is explicit (approvals, your own bulk run)", async () => {
    const { service, repo } = settingsHarness();
    await expect(service.update("APPROVAL_PENDING", { roleIds: [ROLE_1] }, USER)).rejects.toBeInstanceOf(ValidationException);
    await expect(service.update("BULK_BILLING_DONE", { roleIds: [ROLE_1] }, USER)).rejects.toBeInstanceOf(ValidationException);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it("refuses roles for an event whose recipients are chosen on the Licence page", async () => {
    const { service } = settingsHarness();
    await expect(service.update("PARENT_INVOICE_CREATED", { roleIds: [ROLE_1] }, USER)).rejects.toBeInstanceOf(ValidationException);
  });

  it("still lets the school switch any of those events off", async () => {
    const { service, repo } = settingsHarness();
    await service.update("APPROVAL_PENDING", { isEnabled: false }, USER);
    await service.update("PARENT_INVOICE_CREATED", { isEnabled: false }, USER);
    expect(repo.upsert).toHaveBeenCalledTimes(2);
  });
});

describe("NotificationPreferencesService", () => {
  function preferencesHarness(stored: Array<{ category: string; isEnabled: boolean }> = []) {
    const repo = {
      listForUser: jest.fn(async () => stored),
      upsert: jest.fn(async (_userId: string, category: string, isEnabled: boolean) => {
        const existing = stored.find((row) => row.category === category);
        if (existing) existing.isEnabled = isEnabled;
        else stored.push({ category, isEnabled });
      }),
    };
    return { service: new NotificationPreferencesService(repo as never), repo };
  }

  it("lists every category on by default, marking approvals and security essential", async () => {
    const { service } = preferencesHarness();
    expect(await service.list(USER)).toEqual([
      { category: "APPROVALS", essential: true, isEnabled: true },
      { category: "MONEY", essential: false, isEnabled: true },
      { category: "SYSTEM", essential: false, isEnabled: true },
      { category: "OPERATIONS", essential: false, isEnabled: true },
      { category: "SECURITY", essential: true, isEnabled: true },
    ]);
  });

  it("shows a category the person switched off, but an essential one is always on even if a row says off", async () => {
    const { service } = preferencesHarness([
      { category: "MONEY", isEnabled: false },
      { category: "SECURITY", isEnabled: false },
    ]);
    const items = await service.list(USER);
    expect(items.find((item) => item.category === "MONEY")?.isEnabled).toBe(false);
    expect(items.find((item) => item.category === "SECURITY")?.isEnabled).toBe(true);
  });

  it("switches a category off and back on for the caller", async () => {
    const { service, repo } = preferencesHarness();
    const off = await service.set(USER, "OPERATIONS", false);
    expect(repo.upsert).toHaveBeenCalledWith(USER, "OPERATIONS", false);
    expect(off.find((item) => item.category === "OPERATIONS")?.isEnabled).toBe(false);
    const on = await service.set(USER, "OPERATIONS", true);
    expect(on.find((item) => item.category === "OPERATIONS")?.isEnabled).toBe(true);
  });

  it("refuses to switch off an essential category, and any category that does not exist", async () => {
    const { service, repo } = preferencesHarness();
    await expect(service.set(USER, "SECURITY", false)).rejects.toBeInstanceOf(ValidationException);
    await expect(service.set(USER, "APPROVALS", false)).rejects.toBeInstanceOf(ValidationException);
    await expect(service.set(USER, "GOSSIP", false)).rejects.toBeInstanceOf(ValidationException);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it("allows switching an essential category 'on' (a no-op, not an error)", async () => {
    const { service } = preferencesHarness();
    await expect(service.set(USER, "SECURITY", true)).resolves.toBeDefined();
  });
});
