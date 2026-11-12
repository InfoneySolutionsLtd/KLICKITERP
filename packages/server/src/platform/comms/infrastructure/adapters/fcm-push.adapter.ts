import { App, cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { generateUuidV7 } from "../../../../shared/ids/uuid7";
import { CommTestResult } from "../ports/comm-test-result";
import { PushPort } from "../ports/push.port";
import { SendResult } from "../ports/send-result";

/** Sourced from a `set_integration_config` row of `kind='FCM'` (decrypted by `AdapterResolverService`), never raw env vars. */
export interface FcmPushConfig {
  projectId: string;
  clientEmail: string;
  /** PEM private key from the Firebase service account JSON. Normalised by `normalizeFcmPrivateKey()` before use: `\n` escape sequences are un-escaped, and a pasted whole-JSON file has its `private_key` extracted. */
  privateKey: string;
}

const PRIVATE_KEY_HELP =
  'Paste only the "private_key" value from the Firebase service account JSON (it begins with -----BEGIN PRIVATE KEY-----), or paste the whole JSON file.';

/**
 * Turns whatever was pasted into the private-key field into a plain PEM
 * string. Accepts, in order of how often they actually happen:
 *  - the WHOLE service-account JSON file (its `private_key` is extracted) —
 *    the most common mistake, since the file is what Firebase hands you;
 *  - the key with its `\n` escape sequences still literal (copied straight
 *    out of the JSON string), optionally wrapped in the JSON string's quotes;
 *  - a bare PEM with real newlines (or CRLFs).
 * Anything that still isn't a PEM private key afterwards is rejected with a
 * message that says what to paste, instead of OpenSSL's bare
 * "error:1E08010C:DECODER routines::unsupported".
 */
export function normalizeFcmPrivateKey(raw: string): string {
  let key = raw.trim();

  if (key.startsWith("{")) {
    try {
      const parsed = JSON.parse(key) as { private_key?: unknown };
      if (typeof parsed.private_key === "string") key = parsed.private_key.trim();
    } catch {
      // Not valid JSON — fall through; the PEM check below reports it.
    }
  }

  if (key.length >= 2 && key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();

  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key) || !/-----END [A-Z ]*PRIVATE KEY-----/.test(key)) {
    throw new Error(`The FCM private key is not a PEM private key. ${PRIVATE_KEY_HELP}`);
  }
  return key;
}

/**
 * Real `firebase-admin`-based `PushPort` implementation. Each instance owns
 * its own named Firebase `App` (the Admin SDK keys apps by name in a
 * process-global registry, so a fixed/default name would collide the moment
 * a second instance were constructed — `AdapterResolverService` already
 * caches one adapter instance per resolved integration config, so in
 * practice this constructor only runs once per config until it changes).
 */
export class FcmPushAdapter implements PushPort {
  private readonly app: App;

  constructor(private readonly config: FcmPushConfig) {
    const privateKey = normalizeFcmPrivateKey(config.privateKey);
    let credential: ReturnType<typeof cert>;
    try {
      credential = cert({ projectId: config.projectId, clientEmail: config.clientEmail, privateKey });
    } catch (error) {
      // Looks like a PEM but OpenSSL still can't read it (truncated/mangled).
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${detail} — ${PRIVATE_KEY_HELP}`);
    }
    this.app = initializeApp({ credential }, `comms-fcm-${generateUuidV7()}`);
  }

  async send(recipient: string, body: string, meta?: Record<string, unknown>): Promise<SendResult> {
    const title = typeof meta?.title === "string" ? meta.title : "Notification";
    const messageId = await getMessaging(this.app).send({
      token: recipient,
      notification: { title, body },
    });
    return { providerRef: messageId };
  }

  /** Releases the underlying Firebase `App` — call when an adapter instance is evicted (e.g. `AdapterResolverService` re-resolving after a config change) to avoid leaking named apps in the process-global registry. */
  async dispose(): Promise<void> {
    await deleteApp(this.app);
  }

  /**
   * Real check (FR-SET-003.1) — forces the service-account credential's own
   * OAuth2 access-token acquisition (`Credential.getAccessToken()`, the same
   * call `getMessaging(...).send()` makes internally before every real push)
   * without targeting any device token, so a genuinely bad/expired/malformed
   * service account fails here exactly the same way it would on a real send
   * — no push notification is ever sent as a side effect of this check.
   */
  async testConnection(): Promise<CommTestResult> {
    try {
      const credential = this.app.options.credential;
      if (!credential) {
        return { ok: false, message: "FCM app has no credential configured" };
      }
      await credential.getAccessToken();
      return { ok: true, message: `Firebase service account for project "${this.config.projectId}" authenticated successfully` };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `FCM credential check failed: ${message}` };
    }
  }
}
