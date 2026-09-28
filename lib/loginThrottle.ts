import { prisma } from "@/lib/prisma";

/**
 * Rate-limit входу (2026-09-18, переписано атомарно 2026-09-27) — захист від
 * перебору 4-значного PIN (lib/auth.js) і пароля /admin. Лічильник у таблиці
 * LoginAttempt, не в пам'яті: serverless-інстанси Vercel пам'яті не ділять.
 *
 * Спроба рахується ДО перевірки PIN одним UPSERT … RETURNING. Попередня
 * схема «прочитати → перевірити → записати помилку» пропускала паралельну
 * пачку запитів: усі читали failCount < 5 раніше, ніж п'ята помилка
 * встигала записати блокування, — одна пачка перевіряла сотні PIN.
 *
 * Ключі: "pin:<code>" (на код), "admin-login:<ip>" (на IP — блокування
 * спільного ключа дозволяло будь-кому п'ятьма запитами замкнути всіх
 * адмінів), "ip-*" / "pinreq:*" — hitRateLimit нижче.
 */
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

type Row = { failCount: number; lockedUntil: Date | null };

export function pinThrottleKey(externalCode: string): string {
  return `pin:${externalCode.trim().toLowerCase()}`;
}

/** IP клієнта: на Vercel перший запис x-forwarded-for ставить сама платформа. */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  return xff?.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

/**
 * Рахує спробу входу. allowed:false — ключ заблоковано (або вже вичерпано
 * ліміт паралельними запитами). attempt — номер цієї спроби, його треба
 * передати в settleFailure, якщо PIN не підійшов. Прострочене блокування
 * скидається тут же, в тому ж UPSERT.
 */
export async function registerAttempt(key: string): Promise<{ allowed: boolean; attempt: number; retryAt?: Date }> {
  const [row] = await prisma.$queryRaw<Row[]>`
    INSERT INTO "LoginAttempt" ("key", "failCount", "updatedAt")
    VALUES (${key}, 1, now() AT TIME ZONE 'UTC')
    ON CONFLICT ("key") DO UPDATE SET
      "failCount" = CASE WHEN "LoginAttempt"."lockedUntil" <= now() AT TIME ZONE 'UTC' THEN 1 ELSE "LoginAttempt"."failCount" + 1 END,
      "lockedUntil" = CASE WHEN "LoginAttempt"."lockedUntil" <= now() AT TIME ZONE 'UTC' THEN NULL ELSE "LoginAttempt"."lockedUntil" END,
      "updatedAt" = now() AT TIME ZONE 'UTC'
    RETURNING "failCount", "lockedUntil"`;
  if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
    return { allowed: false, attempt: row.failCount, retryAt: row.lockedUntil };
  }
  if (row.failCount > MAX_ATTEMPTS) {
    return { allowed: false, attempt: row.failCount, retryAt: await lock(key) };
  }
  return { allowed: true, attempt: row.failCount };
}

/** Невдала спроба: п'ята поспіль блокує ключ на LOCK_MS. */
export async function settleFailure(key: string, attempt: number): Promise<{ locked: boolean; retryAt?: Date }> {
  if (attempt < MAX_ATTEMPTS) return { locked: false };
  return { locked: true, retryAt: await lock(key) };
}

async function lock(key: string): Promise<Date> {
  const retryAt = new Date(Date.now() + LOCK_MS);
  await prisma.loginAttempt.update({ where: { key }, data: { lockedUntil: retryAt } });
  return retryAt;
}

/** Успішний вхід — прибирає лічильник і будь-яке блокування. */
export async function recordSuccess(key: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { key } });
}

/**
 * Ліміт частоти: не більше max подій за вікно windowMs (вікно відраховується
 * від першої події, lockedUntil тут — кінець вікна). Для запиту PIN (лист на
 * кожен виклик — email-бомбінг і вичерпана квота Gmail без нього) і
 * загальних лімітів на IP.
 */
export async function hitRateLimit(key: string, max: number, windowMs: number): Promise<{ allowed: boolean; retryAt: Date }> {
  const seconds = windowMs / 1000;
  const [row] = await prisma.$queryRaw<Row[]>`
    INSERT INTO "LoginAttempt" ("key", "failCount", "lockedUntil", "updatedAt")
    VALUES (${key}, 1, now() AT TIME ZONE 'UTC' + make_interval(secs => ${seconds}::float8), now() AT TIME ZONE 'UTC')
    ON CONFLICT ("key") DO UPDATE SET
      "failCount" = CASE WHEN "LoginAttempt"."lockedUntil" IS NULL OR "LoginAttempt"."lockedUntil" <= now() AT TIME ZONE 'UTC'
        THEN 1 ELSE "LoginAttempt"."failCount" + 1 END,
      "lockedUntil" = CASE WHEN "LoginAttempt"."lockedUntil" IS NULL OR "LoginAttempt"."lockedUntil" <= now() AT TIME ZONE 'UTC'
        THEN now() AT TIME ZONE 'UTC' + make_interval(secs => ${seconds}::float8) ELSE "LoginAttempt"."lockedUntil" END,
      "updatedAt" = now() AT TIME ZONE 'UTC'
    RETURNING "failCount", "lockedUntil"`;
  return { allowed: row.failCount <= max, retryAt: row.lockedUntil ?? new Date(Date.now() + windowMs) };
}

export function tooManyRequests(retryAt: Date, error = "locked") {
  return Response.json(
    { ok: false, error, retryAt },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 1000))) } }
  );
}
