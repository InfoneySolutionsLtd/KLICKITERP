import { ValidationException } from "../../../shared/exceptions/validation.exception";
import { nairobiDate, parseAccountNotification, parseTillNotification } from "../application/kcb-ipn.parser";

/** The example bodies from KCB's published Instant Payment Notification API definition. */
const ACCOUNT_BODY = {
  transactionReference: "FT000262556",
  requestId: "12345",
  channelCode: "202",
  timestamp: "202111110305",
  transactionAmount: "1000",
  currency: "KES",
  customerReference: "1234",
  customerName: "Peter Bor",
  customerMobileNumber: "254711000000",
  balance: "0",
  narration: "School Fees",
  creditAccountIdentifier: "1234567890",
  organizationShortCode: "202",
  tillNumber: "202",
};

const TILL_BODY = {
  header: { messageID: "12345", originatorConversationID: "TEJ6CQQPBQ", channelCode: "202", timeStamp: "20250519133100" },
  requestPayload: {
    primaryData: { businessKey: "1234567", businessKeyType: "notifyBiller" },
    additionalData: {
      notificationData: {
        businessKey: "1234567",
        businessKeyType: "BillReferenceNumber",
        debitMSISDN: "254711000000",
        transactionAmt: "1000",
        transactionDate: "Mon May 19 13:30:54 EAT 2025",
        transactionID: "FT25139M3RM6",
        firstName: "PETER BOR",
        middleName: "",
        lastName: "",
        currency: "KES",
        narration: "School Fees",
        transactionType: "MPESA",
        balance: "0",
      },
    },
  },
};

describe("parseAccountNotification", () => {
  it("maps KCB's account notification onto the internal shape", () => {
    const parsed = parseAccountNotification(ACCOUNT_BODY);
    expect(parsed).toMatchObject({
      kind: "ACCOUNT",
      externalRef: "FT000262556",
      currency: "KES",
      customerReference: "1234",
      payerName: "Peter Bor",
      payerMsisdn: "254711000000",
      narration: "School Fees",
      creditAccount: "1234567890",
      tillNumber: "202",
    });
    expect(parsed.amount.toDecimalString()).toBe("1000.0000");
    expect(parsed.raw).toBe(ACCOUNT_BODY);
  });

  it("reads the compact timestamp as East Africa Time (11 Nov 2021 03:05 EAT = 00:05 UTC)", () => {
    expect(parseAccountNotification(ACCOUNT_BODY).transactionAt.toISOString()).toBe("2021-11-11T00:05:00.000Z");
  });

  it("accepts seconds in the timestamp and an ISO timestamp too", () => {
    expect(parseAccountNotification({ ...ACCOUNT_BODY, timestamp: "20211111030515" }).transactionAt.toISOString()).toBe("2021-11-11T00:05:15.000Z");
    expect(parseAccountNotification({ ...ACCOUNT_BODY, timestamp: "2021-11-11T03:05:00+03:00" }).transactionAt.toISOString()).toBe("2021-11-11T00:05:00.000Z");
  });

  it("falls back to now for an unreadable timestamp instead of rejecting a real payment", () => {
    const before = Date.now();
    const parsed = parseAccountNotification({ ...ACCOUNT_BODY, timestamp: "yesterday-ish" });
    expect(parsed.transactionAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it("defaults the currency to KES and upper-cases it", () => {
    expect(parseAccountNotification({ ...ACCOUNT_BODY, currency: undefined }).currency).toBe("KES");
    expect(parseAccountNotification({ ...ACCOUNT_BODY, currency: "usd" }).currency).toBe("USD");
  });

  it("treats blank optional fields as absent", () => {
    const parsed = parseAccountNotification({ ...ACCOUNT_BODY, customerReference: "  ", customerName: "", narration: undefined });
    expect(parsed.customerReference).toBeNull();
    expect(parsed.payerName).toBeNull();
    expect(parsed.narration).toBeNull();
  });

  it("requires the bank's own reference", () => {
    expect(() => parseAccountNotification({ ...ACCOUNT_BODY, transactionReference: undefined })).toThrow(/transactionReference.*required/);
    expect(() => parseAccountNotification({ ...ACCOUNT_BODY, transactionReference: "   " })).toThrow(ValidationException);
  });

  it("refuses a reference too long to store", () => {
    expect(() => parseAccountNotification({ ...ACCOUNT_BODY, transactionReference: "X".repeat(61) })).toThrow(/longer than 60/);
  });

  it.each([["0"], ["-50"], ["abc"], [""], ["1,000"], ["1e3"], ["12.12345"]])("refuses the amount %p — only a plain positive decimal is money", (bad) => {
    expect(() => parseAccountNotification({ ...ACCOUNT_BODY, transactionAmount: bad })).toThrow(ValidationException);
  });

  it("accepts a numeric amount and decimals", () => {
    expect(parseAccountNotification({ ...ACCOUNT_BODY, transactionAmount: 2500.5 }).amount.toDecimalString()).toBe("2500.5000");
  });

  it("rejects a body that is not a JSON object", () => {
    for (const bad of [null, undefined, "text", 42, [], [1]]) {
      expect(() => parseAccountNotification(bad)).toThrow(ValidationException);
    }
  });
});

describe("parseTillNotification", () => {
  it("maps KCB's till notification onto the internal shape", () => {
    const parsed = parseTillNotification(TILL_BODY);
    expect(parsed).toMatchObject({
      kind: "TILL",
      externalRef: "FT25139M3RM6",
      currency: "KES",
      customerReference: "1234567",
      payerName: "PETER BOR",
      payerMsisdn: "254711000000",
      narration: "School Fees",
      creditAccount: null,
      tillNumber: "1234567",
    });
    expect(parsed.amount.toDecimalString()).toBe("1000.0000");
  });

  it("reads Java's date text (Mon May 19 13:30:54 EAT 2025) as East Africa Time", () => {
    expect(parseTillNotification(TILL_BODY).transactionAt.toISOString()).toBe("2025-05-19T10:30:54.000Z");
  });

  it("falls back to the header timestamp when the transaction date is unreadable or in a zone we do not know", () => {
    const body = structuredClone(TILL_BODY);
    body.requestPayload.additionalData.notificationData.transactionDate = "Mon May 19 13:30:54 PST 2025";
    expect(parseTillNotification(body).transactionAt.toISOString()).toBe("2025-05-19T10:31:00.000Z");
  });

  it("joins first, middle and last name, skipping blanks", () => {
    const body = structuredClone(TILL_BODY);
    Object.assign(body.requestPayload.additionalData.notificationData, { firstName: "Jane", middleName: "W", lastName: "Doe" });
    expect(parseTillNotification(body).payerName).toBe("Jane W Doe");
  });

  it("requires the envelope, the notification data and the transaction id", () => {
    expect(() => parseTillNotification({ header: {} })).toThrow(/requestPayload/);
    expect(() => parseTillNotification({ requestPayload: { additionalData: {} } })).toThrow(/notificationData/);
    const body = structuredClone(TILL_BODY);
    delete (body.requestPayload.additionalData.notificationData as Record<string, unknown>).transactionID;
    expect(() => parseTillNotification(body)).toThrow(/transactionID.*required/);
  });

  it("refuses a non-positive amount", () => {
    const body = structuredClone(TILL_BODY);
    body.requestPayload.additionalData.notificationData.transactionAmt = "0";
    expect(() => parseTillNotification(body)).toThrow(/greater than zero/);
  });
});

describe("nairobiDate", () => {
  it("gives the Nairobi calendar date, not the UTC one (late evening UTC is already tomorrow in Nairobi)", () => {
    expect(nairobiDate(new Date("2026-07-15T22:30:00Z"))).toBe("2026-07-16");
    expect(nairobiDate(new Date("2026-07-15T20:59:59Z"))).toBe("2026-07-15");
  });
});
