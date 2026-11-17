import { KcbBuniAuthError, KcbBuniTokenProvider, KcbHttpPost } from "../kcb-buni-token.provider";

const CONFIG = {
  consumerKey: "the-consumer-key",
  consumerSecret: "the-consumer-secret",
  tokenUrl: "https://accounts.example.test/oauth2/token",
  timeoutMs: 5000,
};

/** `expiresIn: null` leaves expires_in out of the response entirely. */
function tokenResponse(token: string, expiresIn: number | null = 3600) {
  return { status: 200, body: JSON.stringify({ access_token: token, token_type: "Bearer", ...(expiresIn === null ? {} : { expires_in: expiresIn }) }) };
}

describe("KcbBuniTokenProvider", () => {
  let clock: number;
  let post: jest.MockedFunction<KcbHttpPost>;
  const now = () => clock;

  beforeEach(() => {
    clock = 1_000_000;
    post = jest.fn();
  });

  it("asks the token endpoint with HTTP Basic key:secret and the client_credentials grant", async () => {
    post.mockResolvedValueOnce(tokenResponse("tok-1"));
    const provider = new KcbBuniTokenProvider(CONFIG, { post, now });

    await expect(provider.getAccessToken()).resolves.toBe("tok-1");

    const [url, headers, body, timeout] = post.mock.calls[0];
    expect(url).toBe(CONFIG.tokenUrl);
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("the-consumer-key:the-consumer-secret").toString("base64")}`);
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(body).toBe("grant_type=client_credentials");
    expect(timeout).toBe(5000);
  });

  it("reuses a cached token until about a minute before it expires, then refreshes", async () => {
    post.mockResolvedValueOnce(tokenResponse("tok-1", 3600)).mockResolvedValueOnce(tokenResponse("tok-2", 3600));
    const provider = new KcbBuniTokenProvider(CONFIG, { post, now });

    expect(await provider.getAccessToken()).toBe("tok-1");
    clock += 3_000_000; // 50 min later: still valid
    expect(await provider.getAccessToken()).toBe("tok-1");
    expect(post).toHaveBeenCalledTimes(1);

    clock += 541_000; // 59 min 1 s after issue: inside the 60 s safety margin -> refresh
    expect(await provider.getAccessToken()).toBe("tok-2");
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("shares ONE in-flight request between concurrent callers", async () => {
    let release!: (value: { status: number; body: string }) => void;
    post.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const provider = new KcbBuniTokenProvider(CONFIG, { post, now });

    const calls = [provider.getAccessToken(), provider.getAccessToken(), provider.getAccessToken()];
    release(tokenResponse("tok-shared"));

    await expect(Promise.all(calls)).resolves.toEqual(["tok-shared", "tok-shared", "tok-shared"]);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("invalidate() forces a fresh token on the next call", async () => {
    post.mockResolvedValueOnce(tokenResponse("tok-1")).mockResolvedValueOnce(tokenResponse("tok-2"));
    const provider = new KcbBuniTokenProvider(CONFIG, { post, now });

    await provider.getAccessToken();
    provider.invalidate();
    expect(await provider.getAccessToken()).toBe("tok-2");
  });

  it("falls back to a short lifetime when the response has no expires_in", async () => {
    post.mockResolvedValueOnce(tokenResponse("tok-1", null)).mockResolvedValueOnce(tokenResponse("tok-2", null));
    const provider = new KcbBuniTokenProvider(CONFIG, { post, now });

    await provider.getAccessToken();
    clock += 250_000; // fallback lifetime is 300 s, minus the 60 s margin = 240 s -> already stale
    expect(await provider.getAccessToken()).toBe("tok-2");
  });

  it("turns a refusal into a KcbBuniAuthError with the OAuth error, and never caches the failure", async () => {
    post
      .mockResolvedValueOnce({ status: 401, body: JSON.stringify({ error: "invalid_client", error_description: "Client authentication failed" }) })
      .mockResolvedValueOnce(tokenResponse("tok-ok"));
    const provider = new KcbBuniTokenProvider(CONFIG, { post, now });

    const failure = await provider.getAccessToken().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(KcbBuniAuthError);
    expect((failure as KcbBuniAuthError).httpStatus).toBe(401);
    expect((failure as KcbBuniAuthError).oauthError).toBe("invalid_client");

    // the next caller retries instead of being served the failure
    await expect(provider.getAccessToken()).resolves.toBe("tok-ok");
  });

  it("treats a 200 without an access_token as a failure", async () => {
    post.mockResolvedValueOnce({ status: 200, body: JSON.stringify({ token_type: "Bearer" }) });
    const provider = new KcbBuniTokenProvider(CONFIG, { post, now });
    await expect(provider.getAccessToken()).rejects.toBeInstanceOf(KcbBuniAuthError);
  });

  it("wraps a transport failure (timeout, DNS) as a KcbBuniAuthError", async () => {
    post.mockRejectedValueOnce(new Error("timed out after 5000ms"));
    const provider = new KcbBuniTokenProvider(CONFIG, { post, now });
    await expect(provider.getAccessToken()).rejects.toThrow(/timed out after 5000ms/);
  });

  it("never puts the key, secret or token in an error message", async () => {
    post.mockResolvedValueOnce({ status: 401, body: JSON.stringify({ error: "invalid_client", access_token: "" }) });
    const provider = new KcbBuniTokenProvider(CONFIG, { post, now });
    const failure = (await provider.getAccessToken().catch((e: unknown) => e)) as Error;
    expect(failure.message).not.toContain("the-consumer-key");
    expect(failure.message).not.toContain("the-consumer-secret");
    expect(failure.message).not.toContain(Buffer.from("the-consumer-key:the-consumer-secret").toString("base64"));
  });

  it("copes with a non-JSON error body", async () => {
    post.mockResolvedValueOnce({ status: 502, body: "<html>Bad gateway</html>" });
    const provider = new KcbBuniTokenProvider(CONFIG, { post, now });
    await expect(provider.getAccessToken()).rejects.toThrow(/HTTP 502/);
  });
});
