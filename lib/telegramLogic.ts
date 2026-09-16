import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Чиста логіка Telegram-бота (без prisma/fetch — тестується напряму):
 * токен прив’язки для deep link, розбір команд, форматування повідомлення.
 * IO — lib/telegram.ts.
 */

export const DEFAULT_BOT_USERNAME = "CarlsON_bot";
/** Deep link живе 15 хв — його відкривають одразу після тапу в профілі. */
export const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

/**
 * Токен для `t.me/<bot>?start=<token>`: Telegram дозволяє в start лише
 * [A-Za-z0-9_-] і до 64 символів, тому формат `<employeeId>_<expSec>_<hmac20hex>`
 * (~37 символів). Без таблиці в БД: підпис HMAC на SESSION_SECRET.
 */
export function signLinkToken(employeeId: number, secret: string, now = Date.now()): string {
  const exp = Math.floor((now + LINK_TOKEN_TTL_MS) / 1000);
  const payload = `${employeeId}_${exp}`;
  return `${payload}_${hmac(payload, secret)}`;
}

/** employeeId або null (зіпсований, прострочений, чужий підпис). */
export function verifyLinkToken(token: string | undefined | null, secret: string, now = Date.now()): number | null {
  if (!token) return null;
  const parts = token.split("_");
  if (parts.length !== 3) return null;
  const [idStr, expStr, sig] = parts;
  if (!/^\d{1,9}$/.test(idStr) || !/^\d{1,12}$/.test(expStr) || !/^[0-9a-f]{20}$/.test(sig)) return null;
  if (Number(expStr) * 1000 < now) return null;
  const expected = hmac(`${idStr}_${expStr}`, secret);
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return Number(idStr);
}

function hmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex").slice(0, 20);
}

export function deepLink(botUsername: string, token: string): string {
  return `https://t.me/${botUsername}?start=${token}`;
}

export type BotCommand = { cmd: "start"; arg: string } | { cmd: "stop" } | { cmd: "help" } | null;

/** `/start <token>`, `/start@CarlsON_bot <token>`, `/stop`, `/help`; інше — null. */
export function parseCommand(text: string | undefined | null): BotCommand {
  const m = /^\/(start|stop|help)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec((text || "").trim());
  if (!m) return null;
  if (m[1] === "start") return { cmd: "start", arg: (m[2] || "").trim() };
  return { cmd: m[1] as "stop" | "help" };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Той самий заголовок+текст, що в push, у Telegram-HTML. */
export function formatTelegramMessage({ title, message }: { title?: string | null; message: string }): string {
  const body = escapeHtml(message);
  return title ? `<b>${escapeHtml(title)}</b>\n${body}` : body;
}

/** Абсолютний URL для кнопки «Відкрити»; без базової адреси кнопки нема. */
export function absoluteUrl(base: string | null | undefined, url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}
