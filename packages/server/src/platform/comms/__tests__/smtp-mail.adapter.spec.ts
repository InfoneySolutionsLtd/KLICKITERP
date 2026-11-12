import { createTransport } from "nodemailer";
import { SmtpMailAdapter } from "../infrastructure/adapters/smtp-mail.adapter";

jest.mock("nodemailer", () => ({ createTransport: jest.fn() }));

function adapterWhoseVerify(verify: jest.Mock): SmtpMailAdapter {
  (createTransport as jest.Mock).mockReturnValue({ verify, sendMail: jest.fn() });
  return new SmtpMailAdapter({ host: "mail.example.com", port: 993, secure: true, fromAddress: "erp@example.com" });
}

describe("SmtpMailAdapter.testConnection", () => {
  it("reports success when the SMTP handshake verifies", async () => {
    const adapter = adapterWhoseVerify(jest.fn().mockResolvedValue(true));

    await expect(adapter.testConnection()).resolves.toEqual({
      ok: true,
      message: "SMTP connection to mail.example.com:993 verified",
    });
  });

  it("explains an IMAP greeting (SMTP form pointed at port 993) and keeps the server's own words", async () => {
    const imapError = new Error(
      "Invalid greeting. response=* OK [CAPABILITY IMAP4rev1 LOGIN-REFERRALS ID ENABLE IDLE SASL-IR LITERAL+ AUTH=PLAIN AUTH=LOGIN] Dovecot ready.",
    );
    const adapter = adapterWhoseVerify(jest.fn().mockRejectedValue(imapError));

    const result = await adapter.testConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("mail.example.com:993");
    expect(result.message).toContain("IMAP/POP3 mailbox server");
    expect(result.message).toContain("465");
    expect(result.message).toContain("587");
    expect(result.message).toContain("Dovecot ready");
  });

  it("explains a POP3 greeting the same way", async () => {
    const adapter = adapterWhoseVerify(jest.fn().mockRejectedValue(new Error("Invalid greeting. response=+OK Dovecot ready.")));

    const result = await adapter.testConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("IMAP/POP3 mailbox server");
  });

  it("leaves every other failure's message untouched", async () => {
    const adapter = adapterWhoseVerify(jest.fn().mockRejectedValue(new Error("Invalid login: 535 Authentication failed")));

    await expect(adapter.testConnection()).resolves.toEqual({
      ok: false,
      message: "SMTP verify failed: Invalid login: 535 Authentication failed",
    });
  });
});
