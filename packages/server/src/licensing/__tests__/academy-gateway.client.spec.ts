import { EventEmitter } from "node:events";
import * as https from "node:https";
import { AppConfigService } from "../../shared/config/app-config.service";
import { AcademyGatewayException } from "../../shared/exceptions/academy-gateway.exception";
import { AcademyGatewayClient } from "../infrastructure/academy-gateway.client";

jest.mock("node:https", () => ({ request: jest.fn() }));
jest.mock("node:http", () => ({ request: jest.fn() }));

interface FakeRequest extends EventEmitter {
  write: jest.Mock;
  end: jest.Mock;
  destroy: jest.Mock;
}

/** Wraps a payload in the real Academy Gateway's own `{success, message, data}` envelope (confirmed live against `https://api.infoneysolutions.com`). */
function envelope(data: unknown): { success: true; message: string; data: unknown } {
  return { success: true, message: "Request successfully executed", data };
}

/** Queues one fake HTTP response — `req.end()` synchronously drives the response callback, mirroring real Node timing (listeners are attached before `end()`/`write()` run). */
function queueResponse(status: number, body: unknown): void {
  (https.request as jest.Mock).mockImplementationOnce((_options: unknown, callback: (res: EventEmitter) => void) => {
    const req = new EventEmitter() as FakeRequest;
    req.write = jest.fn();
    req.destroy = jest.fn();
    req.end = jest.fn(() => {
      const res = new EventEmitter() as EventEmitter & { statusCode: number };
      res.statusCode = status;
      callback(res);
      const text = typeof body === "string" ? body : JSON.stringify(body);
      res.emit("data", Buffer.from(text));
      res.emit("end");
    });
    return req;
  });
}

/** Queues a network-level failure — emitted via `process.nextTick` so the real code's `req.on("error", ...)` listener (attached synchronously, after this factory returns) is in place first. */
function queueNetworkError(message: string): void {
  (https.request as jest.Mock).mockImplementationOnce(() => {
    const req = new EventEmitter() as FakeRequest;
    req.write = jest.fn();
    req.end = jest.fn();
    req.destroy = jest.fn();
    process.nextTick(() => req.emit("error", new Error(message)));
    return req;
  });
}

/** Queues a network error shaped like Node's own real `ECONNREFUSED` on this platform — an empty `.message` with only `.code` populated (confirmed live against an unreachable `ACADEMY_GATEWAY_URL`). */
function queueCodeOnlyNetworkError(code: string): void {
  (https.request as jest.Mock).mockImplementationOnce(() => {
    const req = new EventEmitter() as FakeRequest;
    req.write = jest.fn();
    req.end = jest.fn();
    req.destroy = jest.fn();
    process.nextTick(() => {
      const error = new Error("") as NodeJS.ErrnoException;
      error.code = code;
      req.emit("error", error);
    });
    return req;
  });
}

describe("AcademyGatewayClient", () => {
  let client: AcademyGatewayClient;
  let sleepSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = new AppConfigService();
    jest.spyOn(config, "academyGatewayUrl", "get").mockReturnValue("https://academy.example.com");
    client = new AcademyGatewayClient(config);
    sleepSpy = jest.spyOn(client as unknown as { sleep: (ms: number) => Promise<void> }, "sleep").mockResolvedValue(undefined);
  });

  it("startOnboarding unwraps the real {success, message, data} envelope", async () => {
    queueResponse(
      200,
      envelope({ schoolId: "s1", schoolName: "Example", schoolCode: "ABC123", refId: "r1", expiresInMinutes: 10, message: "sent", email: "a***@example.com", phoneNumber: "+254****42", emailSent: true, smsSent: true }),
    );

    const result = await client.startOnboarding("abc123");

    expect(result.schoolId).toBe("s1");
    expect(result.refId).toBe("r1");
    expect(https.request).toHaveBeenCalledTimes(1);
    const [options] = (https.request as jest.Mock).mock.calls[0];
    expect(options.method).toBe("POST");
    expect(options.path).toBe("/schools/erp/onboarding/start");
  });

  it("startOnboarding unwraps the EXACT real response pasted from https://api.infoneysolutions.com", async () => {
    queueResponse(200, {
      success: true,
      message: "Request successfully executed",
      data: {
        schoolId: "5fb13e3c-9c20-4cf8-9660-0b969a14b238",
        schoolName: "klickit 2",
        schoolCode: "KAS-2414",
        refId: "039d1abb-8d5b-45ab-beab-6f0daa737ed5",
        expiresInMinutes: 10,
        message: "Code sent successfully to your email",
        email: "i***@gmail.com",
        phoneNumber: "2547****56",
        emailSent: true,
        smsSent: false,
      },
    });

    const result = await client.startOnboarding("KAS-2414");

    expect(result.schoolId).toBe("5fb13e3c-9c20-4cf8-9660-0b969a14b238");
    expect(result.email).toBe("i***@gmail.com");
    expect(result.phoneNumber).toBe("2547****56");
    expect(result.smsSent).toBe(false);
  });

  it("throws when a 2xx response carries success:false (a logical failure, not an HTTP error)", async () => {
    queueResponse(200, { success: false, message: "School already onboarded", data: null });

    const error = await client.startOnboarding("abc").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AcademyGatewayException);
    expect((error as AcademyGatewayException).message).toBe("School already onboarded");
    expect(https.request).toHaveBeenCalledTimes(1);
    expect(sleepSpy).not.toHaveBeenCalled();
  });

  it("getEntitlement sends X-ERP-API-Key and no body, as a GET", async () => {
    queueResponse(200, envelope({ schoolId: "s1", product: "ERP", allowed: true, status: "ACTIVE", expiresAt: null, subscriptionId: "sub1", checkedAt: "2026-09-23T10:00:00.000Z" }));

    const result = await client.getEntitlement("kfe_key1_secret");

    expect(result.allowed).toBe(true);
    const [options] = (https.request as jest.Mock).mock.calls[0];
    expect(options.method).toBe("GET");
    expect(options.headers["X-ERP-API-Key"]).toBe("kfe_key1_secret");
    expect(options.headers["Content-Type"]).toBeUndefined();
  });

  it.each([400, 401, 404])("throws immediately on %i with no retry", async (status) => {
    queueResponse(status, { success: false, message: "bad", data: null });

    const error = await client.startOnboarding("abc").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AcademyGatewayException);
    expect((error as AcademyGatewayException).academyStatus).toBe(status);
    expect((error as AcademyGatewayException).httpStatus).toBe(status);
    expect(https.request).toHaveBeenCalledTimes(1);
    expect(sleepSpy).not.toHaveBeenCalled();
  });

  it("surfaces the real envelope message on an error response (confirmed live: a real 401 against the Academy Gateway)", async () => {
    queueResponse(401, { success: false, message: "Invalid or inactive ERP API key", data: null });

    const error = await client.getEntitlement("wrong-key").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AcademyGatewayException);
    expect((error as AcademyGatewayException).message).toBe("Invalid or inactive ERP API key");
  });

  it("retries on 429 then succeeds, backing off 1s", async () => {
    queueResponse(429, { success: false, message: "slow down", data: null });
    queueResponse(200, envelope({ schoolId: "s1", product: "ERP", allowed: true, status: "ACTIVE", expiresAt: null, subscriptionId: null, checkedAt: "2026-09-23T10:00:00.000Z" }));

    const result = await client.getEntitlement("key");

    expect(result.allowed).toBe(true);
    expect(https.request).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 1_000);
  });

  it("retries on 5xx on the full 1s/2s/4s/8s schedule, then throws as 503 once exhausted", async () => {
    queueResponse(500, "server error");
    queueResponse(502, "server error");
    queueResponse(503, "server error");
    queueResponse(504, "server error");
    queueResponse(500, "server error");

    const error = await client.getEntitlement("key").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AcademyGatewayException);
    expect((error as AcademyGatewayException).httpStatus).toBe(503);
    expect((error as AcademyGatewayException).academyStatus).toBe(500);

    expect(https.request).toHaveBeenCalledTimes(5);
    expect(sleepSpy).toHaveBeenCalledTimes(4);
    expect(sleepSpy.mock.calls.map((call) => call[0])).toEqual([1_000, 2_000, 4_000, 8_000]);
  });

  it("retries on a network error, then succeeds", async () => {
    queueNetworkError("ECONNREFUSED");
    queueResponse(200, envelope({ schoolId: "s1", product: "ERP", allowed: false, status: "EXPIRED", expiresAt: null, subscriptionId: null, checkedAt: "2026-09-23T10:00:00.000Z" }));

    const result = await client.getEntitlement("key");

    expect(result.status).toBe("EXPIRED");
    expect(sleepSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the error code when a network error has an empty message (real ECONNREFUSED shape on this platform)", async () => {
    queueCodeOnlyNetworkError("ECONNREFUSED");
    queueCodeOnlyNetworkError("ECONNREFUSED");
    queueCodeOnlyNetworkError("ECONNREFUSED");
    queueCodeOnlyNetworkError("ECONNREFUSED");
    queueCodeOnlyNetworkError("ECONNREFUSED");

    const error = await client.getEntitlement("key").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AcademyGatewayException);
    expect((error as AcademyGatewayException).message).toContain("ECONNREFUSED");
    expect((error as AcademyGatewayException).message.length).toBeGreaterThan(0);
  });

  it("verifyOnboarding posts schoolId/refId/code and returns the apiKey verbatim", async () => {
    queueResponse(
      200,
      envelope({
        school: { id: "s1", schoolName: "Example", schoolCode: "ABC123", schoolType: "SCHOOL", schoolStatus: "ACTIVE", countryId: "ke", region: "Nairobi", contactEmail: "a@example.com", contactPhone: "+254700000000", configComplete: true },
        administrator: { id: "u1", email: "a@example.com", firstName: "Jane", lastName: "Doe" },
        apiKey: "kfe_key1_secret",
        apiKeyWarning: "Store this key securely.",
      }),
    );

    const result = await client.verifyOnboarding("s1", "r1", "4821");

    expect(result.apiKey).toBe("kfe_key1_secret");
    expect(result.school.id).toBe("s1");
  });
});
