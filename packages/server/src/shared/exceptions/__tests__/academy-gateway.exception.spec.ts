import {
  academyNetworkErrorDetail,
  AcademyGatewayException,
  describeAcademyNetworkError,
} from "../academy-gateway.exception";

/** A Node connection error as the real thing looks: a `code`, and a `message` that names the host. */
function nodeError(code: string | undefined, message: string): Error {
  return Object.assign(new Error(message), code ? { code } : {});
}

describe("describeAcademyNetworkError", () => {
  it.each([
    ["CERT_HAS_EXPIRED", "has expired"],
    ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "could not be verified"],
    ["SELF_SIGNED_CERT_IN_CHAIN", "could not be verified"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "could not be verified"],
    ["ENOTFOUND", "address could not be found"],
    ["EAI_AGAIN", "address could not be found"],
    ["ECONNREFUSED", "refused the connection"],
    ["ECONNRESET", "was interrupted"],
    ["ETIMEDOUT", "took too long"],
  ])("says what is wrong in plain words for %s, with the code for support", (code, phrase) => {
    const message = describeAcademyNetworkError(nodeError(code, `connect ${code} dev-api.klickitacademy.com:443`));
    expect(message).toContain(phrase);
    expect(message).toContain(`(${code})`);
    expect(message).toMatch(/^The (Klickit Academy|connection to the Klickit Academy)/);
  });

  it("never puts Node's own text, which names the host and address, in the message", () => {
    const message = describeAcademyNetworkError(nodeError("ENOTFOUND", "getaddrinfo ENOTFOUND dev-api.klickitacademy.com"));
    expect(message).not.toContain("dev-api");
    expect(message).not.toContain("getaddrinfo");

    const refused = describeAcademyNetworkError(nodeError("ECONNREFUSED", "connect ECONNREFUSED 10.0.0.5:443"));
    expect(refused).not.toContain("10.0.0.5");
  });

  it("is a full sentence even when Node gives only a code and an empty message (the real ECONNREFUSED shape here)", () => {
    const message = describeAcademyNetworkError(nodeError("ECONNREFUSED", ""));
    expect(message).toContain("refused the connection");
    expect(message).toContain("ECONNREFUSED");
  });

  it("recognises our own timeout and a dropped socket by their wording when there is no code", () => {
    expect(describeAcademyNetworkError(new Error("Academy Gateway request timed out after 30000ms"))).toBe(
      "The Klickit Academy took too long to answer.",
    );
    expect(describeAcademyNetworkError(new Error("socket hang up"))).toBe("The connection to the Klickit Academy was interrupted.");
  });

  it("falls back to a general sentence for anything it does not know, keeping an unknown code", () => {
    expect(describeAcademyNetworkError(new Error("something odd"))).toBe("The Klickit Academy could not be reached.");
    expect(describeAcademyNetworkError(nodeError("EWEIRD", "x"))).toBe("The Klickit Academy could not be reached. (EWEIRD)");
  });

  it("does not throw for a value that is not an Error", () => {
    for (const odd of [undefined, null, "boom", 42, {}]) {
      expect(describeAcademyNetworkError(odd)).toBe("The Klickit Academy could not be reached.");
    }
  });

  it("keeps the technical detail for the log", () => {
    expect(academyNetworkErrorDetail(nodeError("ENOTFOUND", "getaddrinfo ENOTFOUND dev-api.klickitacademy.com"))).toBe(
      "ENOTFOUND getaddrinfo ENOTFOUND dev-api.klickitacademy.com",
    );
    expect(academyNetworkErrorDetail(undefined)).toBe("no detail");
  });
});

describe("AcademyGatewayException", () => {
  it("passes 400/401/404 from the Academy through and turns anything else, or no answer, into a 503", () => {
    expect(new AcademyGatewayException("x", 401).httpStatus).toBe(401);
    expect(new AcademyGatewayException("x", 404).httpStatus).toBe(404);
    expect(new AcademyGatewayException("x", 500).httpStatus).toBe(503);
    expect(new AcademyGatewayException("x", null).httpStatus).toBe(503);
  });
});
