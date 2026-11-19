import { notifyLicenceStateChange } from "../application/license-state-notice.util";
import { UpdateNoticesService } from "../application/update-notices.service";

describe("notifyLicenceStateChange", () => {
  it("tells the Licence page's people, once, with from / to / valid until, and links to the Licence page", async () => {
    const sink = { emit: jest.fn(async () => 1) };
    await notifyLicenceStateChange(sink, { from: "ACTIVE", to: "GRACE", validTo: "2026-12-31" });
    expect(sink.emit).toHaveBeenCalledTimes(1);
    expect(sink.emit).toHaveBeenCalledWith({
      code: "LICENCE_STATE_CHANGED",
      params: { from: "ACTIVE", to: "GRACE", validTo: "2026-12-31" },
      link: "/license",
      entityType: "license",
    });
  });

  it("says nothing when the state did not change", async () => {
    const sink = { emit: jest.fn(async () => 1) };
    await notifyLicenceStateChange(sink, { from: "ACTIVE", to: "ACTIVE", validTo: "2026-12-31" });
    expect(sink.emit).not.toHaveBeenCalled();
  });

  it("does nothing (and does not fail) when this process has no inbox", async () => {
    await expect(notifyLicenceStateChange(undefined, { from: "ACTIVE", to: "SUSPENDED" })).resolves.toBeUndefined();
  });

  it("sends a null valid-until rather than 'undefined' when there is none", async () => {
    const sink = { emit: jest.fn(async () => 1) };
    await notifyLicenceStateChange(sink, { from: "ACTIVE", to: "SUSPENDED" });
    expect((sink.emit.mock.calls[0] as unknown[])[0]).toMatchObject({ params: { validTo: null } });
  });
});

describe("UpdateNoticesService.record — tells the school an update is available", () => {
  it("raises UPDATE_AVAILABLE with the version and urgency, linking to the Licence page", async () => {
    const repository = { create: jest.fn(async (data: object) => ({ id: "notice-1", ...data })) };
    const sink = { emit: jest.fn(async () => 1) };
    const service = new UpdateNoticesService(repository as never, sink as never);

    const notice = await service.record({ version: "1.4.0", notes: "Fixes", urgency: "MANDATORY" as never });

    expect(notice.id).toBe("notice-1");
    expect(sink.emit).toHaveBeenCalledWith({ code: "UPDATE_AVAILABLE", params: { version: "1.4.0", urgency: "MANDATORY" }, link: "/license", entityType: "update_notice", entityId: "notice-1" });
  });

  it("still records the notice when there is no inbox", async () => {
    const repository = { create: jest.fn(async (data: object) => ({ id: "notice-2", ...data })) };
    const service = new UpdateNoticesService(repository as never);
    await expect(service.record({ version: "1.4.1", notes: "", urgency: "OPTIONAL" as never })).resolves.toMatchObject({ id: "notice-2" });
  });
});
