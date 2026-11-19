import { EntityManager } from "typeorm";
import { Money } from "../../../shared/money/money";
import { StockMovementsService } from "../application/stock-movements.service";

const em = { tx: true } as unknown as EntityManager;

function harness(over: { prior: string; reorderLevel: string | null; withSink?: boolean }) {
  const balance = { id: "bal-1", itemId: "item-1", storeId: "store-1", qty: over.prior, value: Money.fromDecimalString("1000.00") };
  const stockBalanceRepository = { findByIdForUpdate: jest.fn(async () => balance), save: jest.fn(async (e: unknown) => e), create: jest.fn() };
  const movementRepository = { listByRefDoc: jest.fn(async () => []), create: jest.fn(async (data: unknown) => data) };
  const itemRepository = {
    findByIdOrFail: jest.fn(async () => ({ id: "item-1", code: "ITM-1", name: "Exercise books", avgCost: "10.000000", reorderLevel: over.reorderLevel })),
    save: jest.fn(async (e: unknown) => e),
  };
  const stockTakeRepository = { listOpenForStore: jest.fn(async () => []) };
  const notifications = { emit: jest.fn(async () => 1) };
  const service = new StockMovementsService(
    stockBalanceRepository as never,
    movementRepository as never,
    itemRepository as never,
    stockTakeRepository as never,
    over.withSink === false ? undefined : (notifications as never),
  );
  return { service, notifications, itemRepository };
}

const issue = (qty: string) => ({ itemId: "item-1", storeId: "store-1", qty, refDocType: "x", refDocId: "y" });

describe("StockMovementsService — low stock notification", () => {
  it("tells the item managers once, at the issue that takes stock from above the reorder level to below it", async () => {
    const h = harness({ prior: "12.0000", reorderLevel: "10.0000" });
    await h.service.recordIssue(em, issue("4")); // 12 -> 8
    expect(h.notifications.emit).toHaveBeenCalledTimes(1);
    expect(h.notifications.emit).toHaveBeenCalledWith(
      {
        code: "LOW_STOCK",
        params: { item: "Exercise books", onHand: "8", reorderLevel: "10" },
        link: "/inventory/items/item-1",
        entityType: "inv_item",
        entityId: "item-1",
      },
      em, // in the movement's own transaction: it exists exactly when the movement does
    );
  });

  it("also tells them when stock lands exactly ON the reorder level (at or below)", async () => {
    const h = harness({ prior: "12.0000", reorderLevel: "10.0000" });
    await h.service.recordIssue(em, issue("2")); // 12 -> 10
    expect(h.notifications.emit).toHaveBeenCalledTimes(1);
  });

  it("does NOT repeat while stock stays low: an issue from below the level to further below says nothing", async () => {
    const h = harness({ prior: "8.0000", reorderLevel: "10.0000" });
    await h.service.recordIssue(em, issue("3")); // 8 -> 5
    expect(h.notifications.emit).not.toHaveBeenCalled();
  });

  it("says nothing while stock stays above the level", async () => {
    const h = harness({ prior: "20.0000", reorderLevel: "10.0000" });
    await h.service.recordIssue(em, issue("5")); // 20 -> 15
    expect(h.notifications.emit).not.toHaveBeenCalled();
  });

  it("says nothing for an item with no reorder level", async () => {
    const h = harness({ prior: "12.0000", reorderLevel: null });
    await h.service.recordIssue(em, issue("11"));
    expect(h.notifications.emit).not.toHaveBeenCalled();
  });

  it("says nothing for stock coming IN, even into a store that is below the level", async () => {
    const h = harness({ prior: "2.0000", reorderLevel: "10.0000" });
    await h.service.recordReceipt(em, { itemId: "item-1", storeId: "store-1", qty: "3", unitCost: "10.000000", refDocType: "x", refDocId: "y" });
    expect(h.notifications.emit).not.toHaveBeenCalled();
  });

  it("covers a transfer out and a stock-take loss the same way (every outbound movement goes through the same place)", async () => {
    const out = harness({ prior: "12.0000", reorderLevel: "10.0000" });
    await out.service.recordTransferOut(em, { itemId: "item-1", storeId: "store-1", qty: "5", refDocType: "x", refDocId: "y" } as never);
    expect(out.notifications.emit).toHaveBeenCalledTimes(1);

    const adjust = harness({ prior: "12.0000", reorderLevel: "10.0000" });
    await adjust.service.recordAdjustment(em, { itemId: "item-1", storeId: "store-1", qtyDelta: "-5", unitCost: "10.000000", refDocType: "x", refDocId: "y" });
    expect(adjust.notifications.emit).toHaveBeenCalledTimes(1);
  });

  it("an issue that would take stock negative is refused and notifies nobody", async () => {
    const h = harness({ prior: "3.0000", reorderLevel: "10.0000" });
    await expect(h.service.recordIssue(em, issue("5"))).rejects.toThrow();
    expect(h.notifications.emit).not.toHaveBeenCalled();
  });

  it("works unchanged, and reads nothing extra, when no notification sink is configured", async () => {
    const h = harness({ prior: "12.0000", reorderLevel: "10.0000", withSink: false });
    await expect(h.service.recordIssue(em, issue("4"))).resolves.toBeDefined();
    // recordOutbound loads the item once for its cost; the low-stock check must not add a second read
    expect(h.itemRepository.findByIdOrFail).toHaveBeenCalledTimes(1);
  });
});
