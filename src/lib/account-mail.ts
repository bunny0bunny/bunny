import "server-only";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { workerSmtpSocket } from "./smtp-socket";

export type AccountMailPayload = {
  to: string;
  subject: string;
  text: string;
};

export type AccountMailResult = {
  ok: boolean;
  error?: string;
};

export function isLocalMailAllowed(): boolean {
  const mode = process.env.ACCOUNT_MAIL_MODE;
  if (mode !== "local") return false;

  const localDir = process.env.ACCOUNT_MAIL_LOCAL_DIR;
  if (!localDir) return false;

  const isPreview = process.env.BUNNY_LOCAL_PREVIEW === "1";
  const qaDbName = process.env.READER_QA_DATABASE_NAME;
  const dbUrl = process.env.DATABASE_URL || "";
  const origin = process.env.APP_ORIGIN || process.env.NEXTAUTH_URL || "";

  let isLoopbackDb = false;
  let isLoopbackOrigin = false;
  try {
    const database = new URL(dbUrl);
    const application = new URL(origin);
    const hosts = ["127.0.0.1", "localhost", "[::1]"];
    isLoopbackDb = ["postgresql:", "postgres:"].includes(database.protocol) && hosts.includes(database.hostname);
    isLoopbackOrigin = ["http:", "https:"].includes(application.protocol) && hosts.includes(application.hostname);
  } catch { return false; }

  // Local capture explicitly enabled ONLY when:
  // (explicit BUNNY_LOCAL_PREVIEW=1 OR READER_QA_DATABASE_NAME) AND loopback DATABASE_URL + trusted origin loopback
  if ((isPreview || Boolean(qaDbName)) && isLoopbackDb && isLoopbackOrigin) {
    return true;
  }
  return false;
}

export function isAccountMailConfigured(): boolean {
  try { getTrustedAppOrigin(); } catch { return false; }
  if (isLocalMailAllowed()) return true;
  if (process.env.ACCOUNT_MAIL_MODE !== "smtp") return false;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;

  if (host && ["465", "587"].includes(port ?? "") && user && pass && from && !/[\r\n]/.test(from)) {
    return true;
  }
  return false;
}

export function getTrustedAppOrigin(): string {
  const configured = process.env.APP_ORIGIN || process.env.NEXTAUTH_URL;
  if (!configured) {
    throw new Error("Missing APP_ORIGIN / NEXTAUTH_URL");
  }
  const url = new URL(configured);
  const isLoopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) throw new Error("Invalid application origin");
  if (isLoopback && !isLocalMailAllowed() && process.env.ACCOUNT_MAIL_MODE !== "smtp") throw new Error("Local origin requires explicit preview configuration");
  if (!isLoopback && url.protocol !== "https:") {
    throw new Error("Non-loopback application origin must use HTTPS");
  }
  return `${url.protocol}//${url.host}`;
}

export async function sendAccountMail(payload: AccountMailPayload): Promise<AccountMailResult> {
  const { to, subject, text } = payload;
  if (!isAccountMailConfigured()) return { ok: false, error: "mail_unavailable" };

  if (isLocalMailAllowed()) {
    try {
      const localDir = process.env.ACCOUNT_MAIL_LOCAL_DIR!;
      await mkdir(localDir, { recursive: true });
      const id = randomBytes(16).toString("hex");
      const record = {
        id,
        to,
        subject,
        text,
        createdAt: new Date().toISOString(),
      };
      const filePath = path.join(localDir, `${Date.now()}-${id}.json`);
      await writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
      return { ok: true };
    } catch {
      return { ok: false, error: "mail_send_failed" };
    }
  }

  // SMTP Mode
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;

  if (!host || !portStr || !user || !pass || !from) {
    return { ok: false, error: "mail_unavailable" };
  }

  const port = parseInt(portStr, 10);
  const secure = port === 465;

  try {
    const transporter = nodemailer.createTransport({
      ...(process.env.BUNNY_RUNTIME === "cloudflare" ? { getSocket: workerSmtpSocket(host, port) } : {}),
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: {
        user,
        pass,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    await transporter.sendMail({
      // Update the legacy display name only; delivery addresses and SMTP configuration stay intact.
      from: from.replace(/^("?)(Bunny Library|Bunny|مكتبة باني)("?\s*<)/iu,
        (_match, quote: string, name: string, ending: string) => `${quote}${name === "مكتبة باني" ? "مكتبة بانيورا" : /library/i.test(name) ? "Bunyora Library" : "Bunyora"}${ending}`),
      to,
      subject,
      text,
    });
    return { ok: true };
  } catch {
    return { ok: false, error: "mail_send_failed" };
  }
}
