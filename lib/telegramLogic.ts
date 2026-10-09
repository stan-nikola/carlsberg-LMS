import { createHmac, timingSafeEqual } from "node:crypto";
import { safeEqual } from "./safeEqual";

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
  if (!safeEqual(expected, sig)) return null;
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

export type TelegramWebAppUser = { id: number; first_name?: string; last_name?: string; username?: string };


/**
 * Перевірка `initData` Mini App (Telegram Web Apps, офіційний алгоритм
 * core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
 *   secret_key = HMAC_SHA256(key: "WebAppData", data: bot_token)
 *   hash       = hex(HMAC_SHA256(key: secret_key, data: data_check_string))
 * data_check_string — усі поля, КРІМ hash, відсортовані за ключем, рядки
 * `key=value` через "\n". auth_date перевіряємо на свіжість окремо —
 * підпис сам по собі не має терміну дії, Telegram лишає це нам. Вікно —
 * година (було 24): initData, що десь засвітився (лог, скріншот
 * devtools), довше не відкриває дані команди. Mini App бере свіжий
 * initData при кожному відкритті.
 */
export function verifyInitData(
  initData: string | null | undefined,
  botToken: string | undefined,
  maxAgeSec = 3600,
  now = Date.now()
): { ok: true; user: TelegramWebAppUser } | { ok: false } {
  if (!initData || !botToken) return { ok: false };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return { ok: false };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const hashBuf = Buffer.from(hash, "hex");
  const computedBuf = Buffer.from(computedHash, "hex");
  if (hashBuf.length !== computedBuf.length || !timingSafeEqual(hashBuf, computedBuf)) return { ok: false };

  const authDate = Number(params.get("auth_date"));
  if (!authDate || now - authDate * 1000 > maxAgeSec * 1000) return { ok: false };

  const userRaw = params.get("user");
  if (!userRaw) return { ok: false };
  try {
    const user = JSON.parse(userRaw);
    if (!user || typeof user.id !== "number") return { ok: false };
    return { ok: true, user };
  } catch {
    return { ok: false };
  }
}
