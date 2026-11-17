import { createSign, generateKeyPairSync } from "node:crypto";
import { Logger } from "@nestjs/common";
import { AuthenticationException } from "../../../shared/exceptions/authentication.exception";
import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { loadKcbPublicKey } from "../../../shared/integrations/kcb-buni/kcb-ipn-signature";
import { Money } from "../../../shared/money/money";
import { BankIpnNotConfiguredException, KcbIpnService, PaymentValidationInput } from "../application/kcb-ipn.service";

// A throwaway key pair stands in for KCB's.
const kcb = generateKeyPairSync("rsa", { modulusLength: 2048 });
const forger = generateKeyPairSync("rsa", { modulusLength: 2048 });
const kcbPublicKey = loadKcbPublicKey(kcb.publicKey.export({ type: "spki", format: "pem" }).toString());

const BODY = { requestId: "VAL-1", customerReference: "1234", organizationReference: "40254" };

function signed(body: unknown, privateKey = kcb.privateKey, headers: Record<string, string | undefined> = {}): PaymentValidationInput {
  const raw = Buffer.from(JSON.stringify(body));
  return { rawBody: raw, body: JSON.parse(raw.toString()) as unknown, signature: createSign("RSA-SHA256").update(raw).sign(privateKey).toString("base64"), headers };
}

function unsigned(body: unknown, headers: Record<string, string | undefined> = {}): PaymentValidationInput {
  const raw = Buffer.from(JSON.stringify(body));
  return { rawBody: raw, body: JSON.parse(raw.toString()) as unknown, signature: undefined, headers };
}

/** KCB's optional /validation leg: a teller asks "is this reference real, and what is owed?" */
describe("KcbIpnService.handleValidation", () => {
  let service: KcbIpnService;
  let resolved: { configId: string; config: Record<string, unknown>; ipnPublicKey: unknown; tokenProvider: object };
  let appConfig: { nodeEnv: string };
  let studentRepository: { findByAdmissionNo: jest.Mock };
  let invoiceRepository: { findOpenForStudent: jest.Mock };

  function build(resolverResult: unknown): KcbIpnService {
    return new KcbIpnService(
      {} as never,
      {} as never,
      {} as never,
      studentRepository as never,
      invoiceRepository as never,
      { getTyped: jest.fn(async (_key: string, fallback: unknown) => fallback) } as never,
      { resolve: jest.fn(async () => resolverResult) } as never,
      appConfig as never,
      {} as never,
    );
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    studentRepository = {
      findByAdmissionNo: jest.fn(async (admissionNo: string) => (admissionNo === "1234" ? { id: "student-1", firstName: "John", lastName: "Doe" } : null)),
    };
    invoiceRepository = {
      findOpenForStudent: jest.fn(async () => [{ balance: Money.fromDecimalString("12500.50") }, { balance: Money.fromDecimalString("500") }]),
    };
    resolved = {
      configId: "cfg-1",
      config: {
        provider: "KCB_BUNI",
        ipnValidationAuth: "SIGNATURE",
        ipnValidationHeader: "x-api-key",
        ipnValidationSecret: "s3cret-value",
        creditAccountNumber: "1234567890",
      },
      ipnPublicKey: kcbPublicKey,
      tokenProvider: {},
    };
    appConfig = { nodeEnv: "development" };
    service = build(resolved);
  });

  afterEach(() => jest.restoreAllMocks());

  it("answers a signed request: the student's name, what is owed, partial payments allowed, the school's account", async () => {
    await expect(service.handleValidation(signed(BODY))).resolves.toEqual({
      transactionID: "VAL-1",
      statusCode: "0",
      statusMessage: "Success",
      CustomerName: "John Doe",
      billAmount: "13000.50",
      currency: "KES",
      billType: "PARTIAL",
      creditAccountIdentifier: "1234567890",
    });
  });

  it("leaves the account number out when none is configured", async () => {
    resolved.config.creditAccountNumber = undefined;
    expect(await service.handleValidation(signed(BODY))).not.toHaveProperty("creditAccountIdentifier");
  });

  it("reports a student who owes nothing as 0.00", async () => {
    invoiceRepository.findOpenForStudent.mockResolvedValueOnce([]);
    expect((await service.handleValidation(signed(BODY))).billAmount).toBe("0.00");
  });

  it("an unknown reference is a business 'no' (statusCode 1) and reveals nothing", async () => {
    const answer = await service.handleValidation(signed({ ...BODY, customerReference: "NOSUCHSTUDENT" }));
    expect(answer).toEqual({ transactionID: "VAL-1", statusCode: "1", statusMessage: "Invalid customer reference" });
  });

  it("requires a customer reference", async () => {
    await expect(service.handleValidation(signed({ requestId: "x" }))).rejects.toBeInstanceOf(ValidationException);
    await expect(service.handleValidation(signed([]))).rejects.toBeInstanceOf(ValidationException);
  });

  describe("authentication — the answer names a student, so an unauthenticated caller gets nothing", () => {
    it("SIGNATURE mode: a forged or missing signature is refused before any student is looked up", async () => {
      await expect(service.handleValidation(signed(BODY, forger.privateKey))).rejects.toBeInstanceOf(AuthenticationException);
      await expect(service.handleValidation(unsigned(BODY))).rejects.toBeInstanceOf(AuthenticationException);
      expect(studentRepository.findByAdmissionNo).not.toHaveBeenCalled();
    });

    it("SHARED_SECRET mode: accepts the configured header, rejects a wrong or missing one", async () => {
      resolved.config.ipnValidationAuth = "SHARED_SECRET";
      await expect(service.handleValidation(unsigned(BODY, { "x-api-key": "s3cret-value" }))).resolves.toMatchObject({ statusCode: "0" });
      await expect(service.handleValidation(unsigned(BODY, { "x-api-key": "s3cret-valuf" }))).rejects.toBeInstanceOf(AuthenticationException);
      await expect(service.handleValidation(unsigned(BODY, { "x-api-key": "short" }))).rejects.toBeInstanceOf(AuthenticationException);
      await expect(service.handleValidation(unsigned(BODY))).rejects.toBeInstanceOf(AuthenticationException);
      // only the ONE accepted request looked a student up (a lookup is two repository calls: the exact match, then the fetch)
      expect(studentRepository.findByAdmissionNo).toHaveBeenCalledTimes(2);
    });

    it("SHARED_SECRET mode honours a custom header name", async () => {
      resolved.config.ipnValidationAuth = "SHARED_SECRET";
      resolved.config.ipnValidationHeader = "x-kcb-key";
      await expect(service.handleValidation(unsigned(BODY, { "x-kcb-key": "s3cret-value" }))).resolves.toMatchObject({ statusCode: "0" });
      await expect(service.handleValidation(unsigned(BODY, { "x-api-key": "s3cret-value" }))).rejects.toBeInstanceOf(AuthenticationException);
    });

    it("SHARED_SECRET mode with no secret configured refuses rather than letting everyone in", async () => {
      resolved.config.ipnValidationAuth = "SHARED_SECRET";
      resolved.config.ipnValidationSecret = undefined;
      await expect(service.handleValidation(unsigned(BODY, { "x-api-key": "" }))).rejects.toBeInstanceOf(BankIpnNotConfiguredException);
    });

    it("NONE mode works in the sandbox only; production fails closed", async () => {
      resolved.config.ipnValidationAuth = "NONE";
      await expect(service.handleValidation(unsigned(BODY))).resolves.toMatchObject({ statusCode: "0" });

      appConfig.nodeEnv = "production";
      await expect(service.handleValidation(unsigned(BODY))).rejects.toBeInstanceOf(BankIpnNotConfiguredException);
    });

    it("refuses with 503 when KCB BUNI is not set up", async () => {
      await expect(build(null).handleValidation(signed(BODY))).rejects.toBeInstanceOf(BankIpnNotConfiguredException);
    });
  });
});
