import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "../config";
import type { CheckinEmail } from "./email";

export interface SendResult {
  ok: boolean;
  messageId?: string;
  retryable?: boolean;
  category?: string;
}

export interface EmailProvider {
  id: "resend" | "outbox";
  send(to: string, email: CheckinEmail, idempotencyKey: string): Promise<SendResult>;
}

/** Resend over plain fetch. Idempotency-Key prevents duplicate sends on retries. */
function resendProvider(apiKey: string, from: string): EmailProvider {
  return {
    id: "resend",
    async send(to, email, idempotencyKey) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
          },
          body: JSON.stringify({ from, to: [to], subject: email.subject, text: email.text, html: email.html, headers: email.headers }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const body = (await res.json().catch(() => ({}))) as { id?: string };
          return { ok: true, messageId: body.id };
        }
        return { ok: false, retryable: res.status === 429 || res.status >= 500, category: `http_${res.status}` };
      } catch {
        return { ok: false, retryable: true, category: "network" };
      }
    },
  };
}

/**
 * Development outbox: writes the email to .data/outbox instead of sending it.
 * Lets the whole reminder pipeline run locally without an email account.
 */
function outboxProvider(): EmailProvider {
  return {
    id: "outbox",
    async send(to, email, idempotencyKey) {
      const dir = path.join(process.cwd(), ".data", "outbox");
      await mkdir(dir, { recursive: true });
      const file = path.join(dir, `${idempotencyKey}.txt`);
      await writeFile(file, `To: ${to}\nSubject: ${email.subject}\n\n${email.text}\n`, { flag: "w" });
      return { ok: true, messageId: `outbox-${idempotencyKey}` };
    },
  };
}

export function getEmailProvider(): EmailProvider | null {
  const { email } = getConfig();
  if (email.mode === "resend") return resendProvider(email.apiKey!, email.from!);
  if (email.mode === "outbox") return outboxProvider();
  return null;
}
