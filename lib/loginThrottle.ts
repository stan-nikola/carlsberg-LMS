import { prisma } from "@/lib/prisma";

/**
 * Rate-limit невдалих спроб входу (2026-09-18) — захист від перебору PIN
 * (4 цифри, 10 000 варіантів, lib/auth.js) і пароля /admin. Лічильник у
 * таблиці LoginAttempt, не в пам'яті процесу — Vercel serverless-функції
 * не мають спільної пам'яті між викликами, тож in-memory лічильник просто
 * не спрацював би надійно (кожен запит може піти в інший інстанс).
 *
 * key: "admin-login" (один спільний лічильник — пароль /admin один на всю
 * організацію, IP тут не рахуємо: справжньої прив'язки до конкретної
 * людини все одно нема) або "pin:<externalCode>" (окремо на кожен код,
 * lowercase — той самий регістронезалежний пошук, що й сам логін).
 */
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

export function pinThrottleKey(externalCode: string): string {
  return `pin:${externalCode.trim().toLowerCase()}`;
}

export async function checkThrottle(key: string): Promise<{ locked: boolean; retryAt?: Date }> {
  const row = await prisma.loginAttempt.findUnique({ where: { key } });
  if (row?.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
    return { locked: true, retryAt: row.lockedUntil };
  }
  return { locked: false };
}

/** Викликати на кожну невдалу спробу. 5-та поспіль — блокує на LOCK_MS. */
export async function recordFailure(key: string): Promise<void> {
  const row = await prisma.loginAttempt.upsert({
    where: { key },
    create: { key, failCount: 1 },
    update: { failCount: { increment: 1 } },
  });
  if (row.failCount >= MAX_ATTEMPTS) {
    await prisma.loginAttempt.update({
      where: { key },
      data: { failCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) },
    });
  }
}

/** Викликати на успішний вхід — прибирає лічильник і будь-яке блокування. */
export async function recordSuccess(key: string): Promise<void> {
  await prisma.loginAttempt.deleteMany({ where: { key } });
}
