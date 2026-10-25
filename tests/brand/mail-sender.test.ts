import { afterAll, expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
let sent: { from: string } | undefined;
mock.module("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: async (payload: { from: string }) => { sent = payload; } }) } }));
const keys = ["APP_ORIGIN", "ACCOUNT_MAIL_MODE", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM", "BUNNY_RUNTIME"] as const;
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
Object.assign(process.env, { APP_ORIGIN: "https://example.test", ACCOUNT_MAIL_MODE: "smtp", SMTP_HOST: "smtp.example.test", SMTP_PORT: "465", SMTP_USER: "fixture", SMTP_PASSWORD: "never-sent", BUNNY_RUNTIME: "node" });
const { sendAccountMail } = await import("../../src/lib/account-mail");
afterAll(() => { for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } });

for (const [before, after] of [
  ["Bunny Library <mail@bunny.example>", "Bunyora Library <mail@bunny.example>"],
  ['"Bunny" <mail@bunny.example>', '"Bunyora" <mail@bunny.example>'],
  ["مكتبة باني <mail@bunny.example>", "مكتبة بانيورا <mail@bunny.example>"],
  ["mail@bunny.example", "mail@bunny.example"],
  ["Bunyora Library <mail@bunny.example>", "Bunyora Library <mail@bunny.example>"],
]) test(`rebrands only the sender display name while preserving its delivery address: ${before}`, async () => {
  process.env.SMTP_FROM = before;
  expect(await sendAccountMail({ to: "nobody@example.test", subject: "QA", text: "No external transport" })).toEqual({ ok: true });
  expect(sent?.from).toBe(after);
});
