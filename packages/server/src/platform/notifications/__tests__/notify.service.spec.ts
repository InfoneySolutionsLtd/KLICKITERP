/* eslint-disable @typescript-eslint/no-explicit-any */
import { MAX_PAGE_SIZE, NotifyService } from "../application/notify.service";

const A = "u0000000-0000-4000-8000-00000000000a";
const B = "u0000000-0000-4000-8000-00000000000b";
const C = "u0000000-0000-4000-8000-00000000000c";
const ROLE = "r0000000-0000-4000-8000-000000000001";

interface Over {
  /** Settings by event code. */
  settings?: Record<string, { isEnabled: boolean; roleIds: string[] }>;
  /** People who switched a category off, by category. */
  off?: Record<string, string[]>;
  /** Who holds the default permissions / the chosen roles. */
  holders?: string[];
  roleHolders?: string[];
}

function harness(over: Over = {}) {
  const written: any[] = [];
  const repo = {
    createMany: jest.fn(async (rows: any[]) => {
      written.push(...rows);
      return rows.map((row, index) => ({ id: `n${written.length - rows.length + index}`, ...row }));
    }),
    listForUser: jest.fn(async () => [[], 0] as [any[], number]),
    countUnreadForUser: jest.fn(async () => 3),
    markRead: jest.fn(async () => undefined),
    markUnread: jest.fn(async () => undefined),
    markAllReadForUser: jest.fn(async () => undefined),
  };
  const settings = { findByCode: jest.fn(async (code: string) => over.settings?.[code] ?? null) };
  const preferences = {
    findUserIdsWithCategoryOff: jest.fn(async (ids: string[], category: string) => new Set(ids.filter((id) => over.off?.[category]?.includes(id)))),
  };
  const users = {
    listActiveUserIdsWithPermissions: jest.fn(async () => over.holders ?? []),
    listActiveUserIdsInRoles: jest.fn(async () => over.roleHolders ?? []),
  };
  const bus = { publishSoon: jest.fn() };
  const service = new NotifyService(repo as never, settings as never, preferences as never, users as never, bus as never);
  return { service, repo, settings, preferences, users, bus, written };
}

const chequeEvent = { code: "CHEQUE_BOUNCED", params: { chequeNo: "000123", amount: "5,000", payer: "Mr Otieno" }, link: "/payments/cheques" };

describe("NotifyService.emit — who gets it", () => {
  it("sends a permission event to the active people holding the event's default permissions", async () => {
    const h = harness({ holders: [A, B] });
    const count = await h.service.emit(chequeEvent);

    expect(count).toBe(2);
    expect(h.users.listActiveUserIdsWithPermissions).toHaveBeenCalledWith(["payments:cheque:manage"], undefined);
    expect(h.written.map((row) => row.userId).sort()).toEqual([A, B].sort());
  });

  it("uses the roles the school chose INSTEAD of the default permission holders", async () => {
    const h = harness({ holders: [A], roleHolders: [B, C], settings: { CHEQUE_BOUNCED: { isEnabled: true, roleIds: [ROLE] } } });
    await h.service.emit(chequeEvent);

    expect(h.users.listActiveUserIdsInRoles).toHaveBeenCalledWith([ROLE], undefined);
    expect(h.users.listActiveUserIdsWithPermissions).not.toHaveBeenCalled();
    expect(h.written.map((row) => row.userId).sort()).toEqual([B, C].sort());
  });

  it("sends nothing, and looks nobody up, when the school switched the event off", async () => {
    const h = harness({ holders: [A], settings: { CHEQUE_BOUNCED: { isEnabled: false, roleIds: [] } } });
    expect(await h.service.emit(chequeEvent)).toBe(0);
    expect(h.users.listActiveUserIdsWithPermissions).not.toHaveBeenCalled();
    expect(h.repo.createMany).not.toHaveBeenCalled();
    expect(h.bus.publishSoon).not.toHaveBeenCalled();
  });

  it("adds named users to the audience, never repeats a person, and leaves out the excluded one", async () => {
    const h = harness({ holders: [A, B] });
    await h.service.emit({ ...chequeEvent, userIds: [B, C], excludeUserIds: [A] });
    expect(h.written.map((row) => row.userId).sort()).toEqual([B, C].sort());
  });

  it("an explicit-audience event goes ONLY to the named users, whatever the settings say", async () => {
    const h = harness({ holders: [A], settings: { BULK_BILLING_DONE: { isEnabled: true, roleIds: [ROLE] } }, roleHolders: [C] });
    await h.service.emit({ code: "BULK_BILLING_DONE", params: { term: "Term 1", created: 10, skipped: 1, failed: 0 }, userIds: [B] });

    expect(h.users.listActiveUserIdsWithPermissions).not.toHaveBeenCalled();
    expect(h.users.listActiveUserIdsInRoles).not.toHaveBeenCalled();
    expect(h.written.map((row) => row.userId)).toEqual([B]);
  });

  it("ignores roles saved for an event whose audience is managed elsewhere (the Licence page's roles) and uses the named users", async () => {
    const h = harness({ settings: { PARENT_INVOICE_CREATED: { isEnabled: true, roleIds: [ROLE] } }, roleHolders: [C] });
    await h.service.emit({ code: "PARENT_INVOICE_CREATED", params: { count: 1 }, userIds: [A, B] });
    expect(h.users.listActiveUserIdsInRoles).not.toHaveBeenCalled();
    expect(h.written.map((row) => row.userId).sort()).toEqual([A, B].sort());
  });

  it("delivers an event that is not in the catalogue to its named users only, uncategorised and not switchable", async () => {
    const h = harness({ holders: [A] });
    await h.service.emit({ code: "SOMETHING_NEW", title: "Hello", body: "From a future module", userIds: [B] });

    expect(h.settings.findByCode).not.toHaveBeenCalled();
    expect(h.preferences.findUserIdsWithCategoryOff).not.toHaveBeenCalled();
    expect(h.written).toEqual([expect.objectContaining({ userId: B, type: "SOMETHING_NEW", category: null, title: "Hello", body: "From a future module" })]);
  });
});

describe("NotifyService.emit — each person's own preference", () => {
  it("leaves out people who switched the category off", async () => {
    const h = harness({ holders: [A, B], off: { MONEY: [A] } });
    await h.service.emit(chequeEvent);
    expect(h.written.map((row) => row.userId)).toEqual([B]);
  });

  it("never leaves out anyone for an essential category (security), even if a stored preference says off", async () => {
    const h = harness({ holders: [A, B], off: { SECURITY: [A] } });
    await h.service.emit({ code: "ACCOUNT_LOCKED", params: { username: "jane" } });
    expect(h.preferences.findUserIdsWithCategoryOff).not.toHaveBeenCalled();
    expect(h.written.map((row) => row.userId).sort()).toEqual([A, B].sort());
  });

  it("writes nothing and hints nobody when every recipient switched the category off", async () => {
    const h = harness({ holders: [A], off: { MONEY: [A] } });
    expect(await h.service.emit(chequeEvent)).toBe(0);
    expect(h.repo.createMany).not.toHaveBeenCalled();
    expect(h.bus.publishSoon).not.toHaveBeenCalled();
  });
});

describe("NotifyService.emit — what is stored", () => {
  it("stores the category, the params and an English fallback title and body built from them", async () => {
    const h = harness({ holders: [A] });
    await h.service.emit({ ...chequeEvent, entityType: "cheque", entityId: "c1" });

    expect(h.written[0]).toEqual({
      userId: A,
      type: "CHEQUE_BOUNCED",
      category: "MONEY",
      params: chequeEvent.params,
      title: "Cheque bounced",
      body: "Cheque 000123 for KES 5,000 was returned unpaid (Mr Otieno).",
      link: "/payments/cheques",
      entityType: "cheque",
      entityId: "c1",
      readAt: null,
    });
  });

  it("lets the caller's own title and body win over the fallback, and truncates what the columns cannot hold", async () => {
    const h = harness({ holders: [A] });
    await h.service.emit({ ...chequeEvent, title: "T".repeat(300), body: "Custom", link: `/x/${"y".repeat(400)}` });
    expect(h.written[0].title).toHaveLength(200);
    expect(h.written[0].body).toBe("Custom");
    expect(h.written[0].link).toHaveLength(300);
  });

  it("hints the bells of exactly the people it wrote for", async () => {
    const h = harness({ holders: [A, B], off: { MONEY: [B] } });
    await h.service.emit(chequeEvent);
    expect(h.bus.publishSoon).toHaveBeenCalledWith([A]);
  });

  it("passes the caller's transaction to every read and write, so the notification commits with the change", async () => {
    const h = harness({ holders: [A] });
    const manager = { tx: true } as any;
    await h.service.emit(chequeEvent, manager);
    expect(h.users.listActiveUserIdsWithPermissions).toHaveBeenCalledWith(["payments:cheque:manage"], manager);
    expect(h.settings.findByCode).toHaveBeenCalledWith("CHEQUE_BOUNCED", manager);
    expect(h.repo.createMany).toHaveBeenCalledWith(expect.any(Array), manager);
  });
});

describe("NotifyService.emit — failures", () => {
  it("without a transaction a failure is swallowed (logged) and never reaches the business code", async () => {
    const h = harness({ holders: [A] });
    h.repo.createMany.mockRejectedValueOnce(new Error("db down"));
    await expect(h.service.emit(chequeEvent)).resolves.toBe(0);
  });

  it("inside a transaction a failure propagates: the transaction is unusable anyway and must roll back", async () => {
    const h = harness({ holders: [A] });
    h.repo.createMany.mockRejectedValueOnce(new Error("db down"));
    await expect(h.service.emit(chequeEvent, {} as any)).rejects.toThrow("db down");
  });
});

describe("NotifyService.notify (one named recipient)", () => {
  it("returns the written notification", async () => {
    const h = harness();
    const result = await h.service.notify({ userId: A, type: "APPROVAL_PENDING", title: "New approval request", body: "x", link: "/approvals/instances/1", params: { domainCode: "EXPENSES", domainName: "Expenses" } });
    expect(result).toEqual(expect.objectContaining({ userId: A, type: "APPROVAL_PENDING", category: "APPROVALS" }));
  });

  it("returns null when the school switched the event off", async () => {
    const h = harness({ settings: { APPROVAL_PENDING: { isEnabled: false, roleIds: [] } } });
    expect(await h.service.notify({ userId: A, type: "APPROVAL_PENDING", title: "x" })).toBeNull();
  });

  it("an approval is delivered even if the person switched APPROVALS off (essential)", async () => {
    const h = harness({ off: { APPROVALS: [A] } });
    expect(await h.service.notify({ userId: A, type: "APPROVAL_PENDING", title: "x" })).not.toBeNull();
  });

  it("a non-essential catalogue event honours the person's preference", async () => {
    const h = harness({ off: { OPERATIONS: [A] } });
    expect(await h.service.notify({ userId: A, type: "LOW_STOCK", title: "x" })).toBeNull();
  });
});

describe("NotifyService — reading and marking", () => {
  it("never lets a page be larger than the cap, however much is asked", async () => {
    const h = harness();
    await h.service.listForUser(A, { page: 1, pageSize: 100000 });
    expect(h.repo.listForUser).toHaveBeenCalledWith(A, { skip: 0, take: MAX_PAGE_SIZE, unreadOnly: undefined });
  });

  it("computes the page offset and passes the unread filter", async () => {
    const h = harness();
    await h.service.listForUser(A, { page: 3, pageSize: 8, unreadOnly: true });
    expect(h.repo.listForUser).toHaveBeenCalledWith(A, { skip: 16, take: 8, unreadOnly: true });
  });

  it("treats a page below 1 as page 1", async () => {
    const h = harness();
    await h.service.listForUser(A, { page: 0, pageSize: 5 });
    expect(h.repo.listForUser).toHaveBeenCalledWith(A, { skip: 0, take: 5, unreadOnly: undefined });
  });

  it("marks read, unread and all read for the caller's own id only", async () => {
    const h = harness();
    await h.service.markRead("n1", A);
    await h.service.markUnread("n1", A);
    await h.service.markAllRead(A);
    expect(h.repo.markRead).toHaveBeenCalledWith("n1", A);
    expect(h.repo.markUnread).toHaveBeenCalledWith("n1", A);
    expect(h.repo.markAllReadForUser).toHaveBeenCalledWith(A);
    expect(await h.service.countUnread(A)).toBe(3);
  });
});
