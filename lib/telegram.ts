import type { PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { DEFAULT_BOT_USERNAME, formatTelegramMessage, absoluteUrl } from "@/lib/telegramLogic";

const prisma = prismaUntyped as PrismaClient;

/**
 * Telegram-бот CarlsON — ще один канал доставки сповіщень поруч із Web Push
 * (lib/webPush.js): та сама подія з lib/notifications.js notifyEmployees
 * іде в центр + push + Telegram усім, хто прив’язав чат (TelegramLink) і
 * не вимкнув канал у профілі (NotificationPreference.telegram).
 *
 * Bot API — прямі fetch-запити, без бібліотеки: потрібні 5 методів.
 * Env: TELEGRAM_BOT_TOKEN (від @BotFather), TELEGRAM_WEBHOOK_SECRET
 * (перевірка вхідних апдейтів), TELEGRAM_BOT_USERNAME (для deep link;
 * дефолт CarlsON_bot), APP_URL (кнопка «Відкрити» під повідомленням).
 * Без токена канал мовчки вимкнено — як push без VAPID.
 */

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function telegramBotUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME || DEFAULT_BOT_USERNAME;
}

/** Публічна адреса застосунку — для кнопки «Відкрити» і webhook. */
export function appBaseUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return null;
}

type ApiResult<T> = { ok: true; result: T } | { ok: false; error_code?: number; description: string };

export async function telegramApi<T = unknown>(method: string, body?: Record<string, unknown>): Promise<ApiResult<T>> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN не задано" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };
    if (data.ok) return { ok: true, result: data.result as T };
    return { ok: false, error_code: data.error_code, description: data.description || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, description: (err as Error)?.message || "network" };
  }
}

export type TelegramPayload = { title?: string | null; message: string; url?: string | null };

function buildSendBody(chatId: string, payload: TelegramPayload) {
  const open = absoluteUrl(appBaseUrl(), payload.url);
  return {
    chat_id: chatId,
    text: formatTelegramMessage(payload),
    parse_mode: "HTML",
    ...(open ? { reply_markup: { inline_keyboard: [[{ text: "Відкрити", url: open }]] } } : {}),
  };
}

/** Чат зник: людина заблокувала бота (403) або видалила чат (400). */
function isGone(r: { ok: false; error_code?: number; description: string }): boolean {
  return r.error_code === 403 || (r.error_code === 400 && /chat not found|user is deactivated/i.test(r.description));
}

/**
 * Надіслати одне повідомлення на список прив’язок. Зниклі чати —
 * прибираються (як push 404/410), інші помилки — у TelegramLink.lastError.
 * ponytail: пачки по 25 з паузою 1с (ліміт Bot API ~30/с); коли
 * підключених стануть тисячі — виносити в чергу, а не в запит.
 */
export async function sendTelegramToLinks(
  links: { employeeId: number; chatId: string }[],
  payload: TelegramPayload
): Promise<{ sent: number; removed: number; failed: number }> {
  if (!isTelegramConfigured() || links.length === 0) return { sent: 0, removed: 0, failed: 0 };

  const delivered: number[] = [];
  const gone: number[] = [];
  const failed: { employeeId: number; error: string }[] = [];

  for (let i = 0; i < links.length; i += 25) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1000));
    await Promise.all(
      links.slice(i, i + 25).map(async (link) => {
        const r = await telegramApi("sendMessage", buildSendBody(link.chatId, payload));
        if (r.ok) delivered.push(link.employeeId);
        else if (isGone(r)) gone.push(link.employeeId);
        else failed.push({ employeeId: link.employeeId, error: r.description.slice(0, 200) });
      })
    );
  }

  if (gone.length) await prisma.telegramLink.deleteMany({ where: { employeeId: { in: gone } } });
  if (delivered.length) {
    await prisma.telegramLink.updateMany({ where: { employeeId: { in: delivered } }, data: { lastSentAt: new Date(), lastError: null } });
  }
  for (const f of failed) {
    await prisma.telegramLink.updateMany({ where: { employeeId: f.employeeId }, data: { lastError: f.error } });
  }
  return { sent: delivered.length, removed: gone.length, failed: failed.length };
}

/** Тестове повідомлення одній людині (адмінка). */
export async function sendTelegramToEmployee(employeeId: number, payload: TelegramPayload) {
  const link = await prisma.telegramLink.findUnique({ where: { employeeId }, select: { employeeId: true, chatId: true } });
  if (!link) return { sent: 0, removed: 0, failed: 0, reason: "not_linked" as const };
  return sendTelegramToLinks([link], payload);
}

/** Відповідь у чат з webhook (без кнопки). */
export async function replyToChat(chatId: string, text: string) {
  return telegramApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

export type WebhookInfo = {
  url: string;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
};

export function getWebhookInfo() {
  return telegramApi<WebhookInfo>("getWebhookInfo");
}

export function webhookUrl(base: string): string {
  return `${base.replace(/\/$/, "")}/api/telegram/webhook`;
}

/** Реєструє webhook на base; secret_token Telegram шле в заголовку кожного апдейту. */
export function setWebhook(base: string) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return Promise.resolve({ ok: false as const, description: "TELEGRAM_WEBHOOK_SECRET не задано" });
  return telegramApi<boolean>("setWebhook", {
    url: webhookUrl(base),
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
}

let meCache: { at: number; value: { username: string; first_name: string } | null } | null = null;

/** @username бота з Bot API (кеш 10 хв) — щоб адмінка показувала реальне ім’я. */
export async function getMe() {
  if (meCache && Date.now() - meCache.at < 10 * 60 * 1000) return meCache.value;
  const r = await telegramApi<{ username: string; first_name: string }>("getMe");
  meCache = { at: Date.now(), value: r.ok ? r.result : null };
  return meCache.value;
}
