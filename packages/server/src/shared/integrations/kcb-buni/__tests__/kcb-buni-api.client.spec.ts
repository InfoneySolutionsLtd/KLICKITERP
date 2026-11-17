import { describeKcbFailure, KcbBuniApiClient } from "../kcb-buni-api.client";
import { KcbHttpPost } from "../kcb-buni-token.provider";

describe("KcbBuniApiClient", () => {
  let post: jest.MockedFunction<KcbHttpPost>;
  let tokens: { getAccessToken: jest.Mock; invalidate: jest.Mock };
  let client: KcbBuniApiClient;

  beforeEach(() => {
    post = jest.fn();
    tokens = { getAccessToken: jest.fn().mockResolvedValueOnce("tok-1").mockResolvedValue("tok-2"), invalidate: jest.fn() };
    client = new KcbBuniApiClient({ gatewayBaseUrl: "https://gw.example.test", timeoutMs: 7000 }, tokens, post);
  });

  it("POSTs JSON to the gateway with the bearer token and parses a JSON answer", async () => {
    post.mockResolvedValueOnce({ status: 200, body: JSON.stringify({ header: { statusCode: "0" } }) });

    const result = await client.postJson("/some/path", { a: 1 });

    expect(result).toEqual({ status: 200, json: { header: { statusCode: "0" } }, text: '{"header":{"statusCode":"0"}}' });
    const [url, headers, body, timeout] = post.mock.calls[0];
    expect(url).toBe("https://gw.example.test/some/path");
    expect(headers.Authorization).toBe("Bearer tok-1");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(body).toBe('{"a":1}');
    expect(timeout).toBe(7000);
  });

  it("on a 401 (token no good) fetches a fresh token and retries exactly once", async () => {
    post.mockResolvedValueOnce({ status: 401, body: "{}" }).mockResolvedValueOnce({ status: 200, body: "{}" });

    const result = await client.postJson("/p", {});

    expect(result.status).toBe(200);
    expect(tokens.invalidate).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1].Authorization).toBe("Bearer tok-2");
  });

  it("gives up after that one retry (a second 401 is returned, not looped on)", async () => {
    post.mockResolvedValue({ status: 401, body: "{}" });
    expect((await client.postJson("/p", {})).status).toBe(401);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it.each([[500], [502], [503], [400], [403]])("NEVER retries a %i — it is unknown whether KCB acted, and repeating a payment request could pay twice", async (status) => {
    post.mockResolvedValue({ status, body: "{}" });
    expect((await client.postJson("/p", {})).status).toBe(status);
    expect(post).toHaveBeenCalledTimes(1);
    expect(tokens.invalidate).not.toHaveBeenCalled();
  });

  it("does not swallow a transport failure (timeout) — and does not retry it either", async () => {
    post.mockRejectedValueOnce(new Error("timed out after 7000ms"));
    await expect(client.postJson("/p", {})).rejects.toThrow("timed out");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("returns json: null for a body that is not a JSON object", async () => {
    post.mockResolvedValueOnce({ status: 502, body: "<html>Bad gateway</html>" });
    expect(await client.postJson("/p", {})).toMatchObject({ status: 502, json: null });
  });
});

describe("describeKcbFailure", () => {
  const res = (json: Record<string, unknown> | null, status = 400) => ({ status, json, text: "" });

  it("prefers KCB's own header status description", () => {
    expect(describeKcbFailure(res({ header: { statusCode: "1", statusDescription: "Insufficient funds" }, message: "other" }))).toBe("Insufficient funds");
  });
  it("falls back to the gateway's description / message", () => {
    expect(describeKcbFailure(res({ code: "900902", message: "Missing Credentials", description: "Invalid Credentials. Make sure…" }))).toBe("Invalid Credentials. Make sure…");
    expect(describeKcbFailure(res({ message: "Bad Request" }))).toBe("Bad Request");
  });
  it("lists the first few fields of a flat validation map (what Funds Transfer answers for a bad request)", () => {
    expect(describeKcbFailure(res({ debitAmount: "must not be null", companyCode: "must not be blank", a: "x", b: "y", c: "z" }))).toBe(
      "debitAmount must not be null; companyCode must not be blank; a x; b y",
    );
  });
  it("falls back to the HTTP status when there is nothing readable", () => {
    expect(describeKcbFailure(res(null, 502))).toBe("HTTP 502");
    expect(describeKcbFailure(res({ header: {} }, 500))).toBe("HTTP 500");
  });
});
