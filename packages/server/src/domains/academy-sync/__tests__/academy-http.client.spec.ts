import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { AcademyGatewayException } from "../../../shared/exceptions/academy-gateway.exception";
import { AcademyHttpClient } from "../infrastructure/academy-http.client";

/** Skips the real 1s/2s/4s/8s waits but records them, so the schedule can still be asserted. */
class FastClient extends AcademyHttpClient {
  readonly waits: number[] = [];
  protected override sleep(ms: number): Promise<void> {
    this.waits.push(ms);
    return Promise.resolve();
  }
}

describe("AcademyHttpClient", () => {
  let server: Server;
  let baseUrl: string;
  let handler: (req: IncomingMessage, res: ServerResponse, count: number) => void;
  let seen: Array<{ method?: string; url?: string; headers: IncomingMessage["headers"]; body: string }>;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk: Buffer) => (body += chunk.toString()));
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, headers: req.headers, body });
        handler(req, res, seen.length);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    seen = [];
  });

  const client = () => new FastClient({ academyGatewayUrl: baseUrl } as never);
  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  it("returns the payload inside the success envelope and sends the key as X-ERP-API-Key", async () => {
    handler = (_req, res) => json(res, 200, { success: true, message: "ok", data: { hello: "world" } });
    const result = await client().get<{ hello: string }>("kfe_a_b", "/erp/students");
    expect(result).toEqual({ hello: "world" });
    expect(seen[0].headers["x-erp-api-key"]).toBe("kfe_a_b");
    expect(seen[0].method).toBe("GET");
  });

  it("builds the query string and drops empty values", async () => {
    handler = (_req, res) => json(res, 200, { success: true, message: "ok", data: null });
    await client().get("kfe_a_b", "/erp/students", { limit: 50, cursor: undefined, updatedSince: "", includeDeleted: "true", other: null });
    expect(seen[0].url).toBe("/erp/students?limit=50&includeDeleted=true");
  });

  it("posts a JSON body", async () => {
    handler = (_req, res) => json(res, 200, { success: true, message: "ok", data: { id: 1 } });
    await client().post("kfe_a_b", "/erp/thing", { a: 1 });
    expect(seen[0].method).toBe("POST");
    expect(seen[0].headers["content-type"]).toBe("application/json");
    expect(JSON.parse(seen[0].body)).toEqual({ a: 1 });
  });

  it("does not retry a rejected key (401) and surfaces the gateway's message", async () => {
    handler = (_req, res) => json(res, 401, { success: false, message: "Invalid or inactive ERP API key", data: null });
    const c = client();
    await expect(c.get("kfe_a_b", "/erp/students")).rejects.toMatchObject({ message: "Invalid or inactive ERP API key", academyStatus: 401 });
    expect(seen).toHaveLength(1);
    expect(c.waits).toEqual([]);
  });

  it("does not retry a bad request or a missing route", async () => {
    handler = (_req, res) => json(res, 400, { success: false, message: "Invalid cursor", data: null });
    await expect(client().get("k", "/erp/students")).rejects.toBeInstanceOf(AcademyGatewayException);
    expect(seen).toHaveLength(1);
  });

  it("retries a 5xx on the 1s/2s schedule and then succeeds", async () => {
    handler = (_req, res, count) =>
      count < 3 ? json(res, 503, { message: "busy" }) : json(res, 200, { success: true, message: "ok", data: { ok: true } });
    const c = client();
    await expect(c.get("k", "/erp/students")).resolves.toEqual({ ok: true });
    expect(seen).toHaveLength(3);
    expect(c.waits).toEqual([1000, 2000]);
  });

  it("retries a 429", async () => {
    handler = (_req, res, count) =>
      count < 2 ? json(res, 429, { message: "slow down" }) : json(res, 200, { success: true, message: "ok", data: 1 });
    await expect(client().get("k", "/x")).resolves.toBe(1);
    expect(seen).toHaveLength(2);
  });

  it("gives up after 5 attempts on a persistent 5xx, with a 503 for our own caller", async () => {
    handler = (_req, res) => json(res, 500, { message: "boom" });
    const c = client();
    const error = await c.get("k", "/erp/students").catch((e: AcademyGatewayException) => e);
    expect(error).toBeInstanceOf(AcademyGatewayException);
    expect((error as AcademyGatewayException).httpStatus).toBe(503);
    expect(seen).toHaveLength(5);
    expect(c.waits).toEqual([1000, 2000, 4000, 8000]);
  });

  it("treats {success:false} on a 200 as a failure without retrying", async () => {
    handler = (_req, res) => json(res, 200, { success: false, message: "Nope", data: null });
    await expect(client().get("k", "/x")).rejects.toMatchObject({ message: "Nope" });
    expect(seen).toHaveLength(1);
  });

  it("reports an unparsable 2xx body clearly", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html>proxy error</html>");
    };
    await expect(client().get("k", "/x")).rejects.toThrow(/unparsable response body/);
  });

  it("retries a connection failure and reports it", async () => {
    const dead = new FastClient({ academyGatewayUrl: "http://127.0.0.1:1" } as never);
    await expect(dead.get("k", "/x")).rejects.toBeInstanceOf(AcademyGatewayException);
    expect(dead.waits).toEqual([1000, 2000, 4000, 8000]);
  });

  it("never puts the key in a thrown error", async () => {
    handler = (_req, res) => json(res, 401, { message: "bad" });
    const error = await client().get("kfe_secretkey_value", "/x").catch((e: Error) => e);
    expect(JSON.stringify(error)).not.toContain("kfe_secretkey_value");
    expect((error as Error).message).not.toContain("kfe_secretkey_value");
  });
});
