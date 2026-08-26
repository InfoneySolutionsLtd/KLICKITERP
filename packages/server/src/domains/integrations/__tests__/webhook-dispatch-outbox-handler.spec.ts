import { EntityManager } from "typeorm";
import { WebhookDispatchOutboxHandler } from "../application/webhook-dispatch-outbox-handler";

const EM = {} as EntityManager;

describe("WebhookDispatchOutboxHandler", () => {
  it("derives a stable, eventType-scoped consumerName", () => {
    const handler = new WebhookDispatchOutboxHandler("billing.invoice_posted", {} as never, {} as never);
    expect(handler.consumerName).toBe("webhook-dispatch:billing.invoice_posted");
    expect(handler.eventType).toBe("billing.invoice_posted");
  });

  it("handle() opens its own transaction and delegates to WebhookDeliveryService.dispatch() with the same eventType/payload", async () => {
    const webhookDeliveryService = { dispatch: jest.fn(async () => []) };
    const dataSource = { transaction: jest.fn((_level: string, work: (em: EntityManager) => Promise<unknown>) => work(EM)) };
    const handler = new WebhookDispatchOutboxHandler("payments.payment_received", webhookDeliveryService as never, dataSource as never);

    await handler.handle({ receiptId: "r-1" });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(webhookDeliveryService.dispatch).toHaveBeenCalledWith(EM, "payments.payment_received", { receiptId: "r-1" });
  });
});
