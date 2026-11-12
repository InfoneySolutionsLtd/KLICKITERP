import { createTransport, Transporter } from "nodemailer";
import { CommTestResult } from "../ports/comm-test-result";
import { MailPort } from "../ports/mail.port";
import { SendResult } from "../ports/send-result";

/** Sourced from a `set_integration_config` row of `kind='SMTP'` (decrypted by `AdapterResolverService`), never raw env vars. */
export interface SmtpMailConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  fromAddress: string;
  fromName?: string;
}

/**
 * Real `nodemailer`-based `MailPort` implementation. `meta?.subject` carries
 * the rendered subject line (see `MailPort`'s doc comment); `body` is sent
 * as HTML — every template in this codebase is authored as plain text with
 * `{{variable}}` placeholders (`TemplatesService.render()`), which is valid
 * (if unstyled) HTML too, so no separate plain-text branch is needed.
 */
export class SmtpMailAdapter implements MailPort {
  private readonly transporter: Transporter;

  constructor(private readonly config: SmtpMailConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? false,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async send(recipient: string, body: string, meta?: Record<string, unknown>): Promise<SendResult> {
    const subject = typeof meta?.subject === "string" ? meta.subject : "(no subject)";
    const from = this.config.fromName ? `"${this.config.fromName}" <${this.config.fromAddress}>` : this.config.fromAddress;

    const info = await this.transporter.sendMail({
      from,
      to: recipient,
      subject,
      html: body,
    });

    return { providerRef: info.messageId };
  }

  /** Real check (FR-SET-003.1) — the transporter's own SMTP handshake/verify, no email sent. */
  async testConnection(): Promise<CommTestResult> {
    try {
      await this.transporter.verify();
      return { ok: true, message: `SMTP connection to ${this.config.host}:${this.config.port} verified` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (looksLikeMailboxServerGreeting(message)) {
        // The most common misconfiguration: the mail host's RECEIVING ports
        // (IMAP 143/993, POP3 110/995) entered as the SMTP port. nodemailer
        // surfaces that as a bare "Invalid greeting. response=* OK [CAPABILITY
        // IMAP4rev1 ...] Dovecot ready" — accurate but opaque to whoever is
        // filling in the Integrations form, so say what it means and what to
        // enter instead (keeping the server's own words for support).
        return {
          ok: false,
          message:
            `SMTP verify failed: ${this.config.host}:${this.config.port} answered like an IMAP/POP3 mailbox server, not an SMTP (mail-sending) server. ` +
            `Ports 143/993/110/995 are for receiving mail. Use your provider's SMTP port instead — usually 465 with "Use TLS/SSL" ticked, ` +
            `or 587 with "Use TLS/SSL" unticked (STARTTLS). Server said: ${message}`,
        };
      }
      return { ok: false, message: `SMTP verify failed: ${message}` };
    }
  }
}

/** True when nodemailer's "Invalid greeting" error carries an IMAP (`* OK [CAPABILITY IMAP4rev1 …`) or POP3 (`+OK …`) banner instead of an SMTP `220`. */
function looksLikeMailboxServerGreeting(message: string): boolean {
  return /invalid greeting/i.test(message) && /IMAP4|\* OK\b|\+OK\b|\bPOP3\b/i.test(message);
}
