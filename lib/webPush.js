import webpush from "web-push";
import { prisma } from "@/lib/prisma";

/**
 * Web Push (W3C Push API + VAPID) — доставка сповіщення на пристрій.
 *
 * Ключі VAPID — секрети, лежать ЛИШЕ в .env / Vercel env (їх вписує
 * користувач сам, див. CLAUDE.md «Сповіщення»):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY — пара з `npx web-push generate-vapid-keys`
 *   VAPID_SUBJECT — mailto:адреса адміністратора (push-сервіси браузерів
 *   вимагають контакт власника ключів)
 *
 * Без ключів модуль НЕ падає: isPushConfigured() → false, сповіщення
 * лишаються лише в центрі застосунку (Notification у БД). Так локальний
 * dev і прев'ю без секретів працюють як раніше.
 *
 * Один і той самий рядок Notification → усі підписки людини
 * (телефон + ноутбук). Push-сервіс, що відповів 404/410, означає: підписка
 * мертва (дозвіл відкликано, PWA перевстановлено) — рядок видаляємо, щоб
 * не молотити в порожнечу щодня.
 */

let configured = null;

export function isPushConfigured() {
  if (configured === null) {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    configured = Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
    if (configured) {
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    } else if (process.env.NODE_ENV !== "test") {
      console.warn("[push] VAPID_* не задано — push вимкнено, сповіщення лише в застосунку");
    }
  }
  return configured;
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/** Статуси, після яких підписку треба видалити (RFC 8030 / push-сервіси). */
const GONE_STATUSES = new Set([404, 410]);

/**
 * Надіслати одне повідомлення на список підписок. Помилки не кидає —
 * доставка push не має ламати бізнес-дію (призначення курсу, видачу
 * ачивки), яка її спричинила.
 *
 * @param {Array<{id:number, endpoint:string, p256dh:string, auth:string}>} subscriptions
 * @param {{title:string, body:string, url?:string, tag?:string, category?:string}} payload
 * @returns {Promise<{sent:number, removed:number, failed:number}>}
 */
export async function sendPushToSubscriptions(subscriptions, payload) {
  if (!isPushConfigured() || subscriptions.length === 0) return { sent: 0, removed: 0, failed: 0 };

  const body = JSON.stringify(payload);
  const options = {
    // Година «життя» в push-сервісі: якщо телефон офлайн довше — сповіщення
    // втрачає сенс (людина побачить його в центрі застосунку).
    TTL: 60 * 60,
    urgency: payload.category === "deadlines" ? "high" : "normal",
    topic: payload.tag ? payload.tag.slice(0, 32).replace(/[^a-zA-Z0-9_-]/g, "_") : undefined,
  };

  let sent = 0;
  let failed = 0;
  const gone = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          options
        );
        sent += 1;
      } catch (err) {
        if (GONE_STATUSES.has(err?.statusCode)) gone.push(sub.id);
        else {
          failed += 1;
          console.warn("[push] send failed", err?.statusCode || err?.message);
        }
      }
    })
  );

  if (gone.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  }
  if (sent > 0) {
    await prisma.pushSubscription.updateMany({
      where: { id: { in: subscriptions.map((s) => s.id) } },
      data: { lastUsedAt: new Date() },
    });
  }

  return { sent, removed: gone.length, failed };
}
