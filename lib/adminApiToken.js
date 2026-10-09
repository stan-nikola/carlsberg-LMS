import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { DAY_MS } from "@/lib/ukraineTime";

// Токени для "живого" Excel-підключення (Фаза B3) — окрема авторизація
// від admin_session cookie, бо Power Query не вміє передавати cookie з
// браузерної сесії. Зберігаємо лише sha256-хеш (як паролі) — сирий токен
// повертається лише РАЗ, у момент створення.
/** Токен живе рік: Power Query-книга не має переставати працювати раптово, але й вічних ключів не буває. */
const TOKEN_TTL_MS = 365 * DAY_MS;

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Генерує новий токен для employeeId (має бути role admin/hr_manager —
 * перевіряється викликачем, тут лише запис). Повертає сирий токен — його
 * більше ніде не зберігаємо, тільки хеш.
 *
 * @param {number} employeeId
 * @param {string|null} label
 * @returns {Promise<{ id: number, rawToken: string }>}
 */
export async function createApiToken(employeeId, label) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const created = await prisma.adminApiToken.create({
    data: { employeeId, label: label || null, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
    select: { id: true },
  });
  return { id: created.id, rawToken };
}

/**
 * Перевіряє Bearer-токен із заголовка Authorization для захищених
 * app/api/data/* ендпоінтів (Фаза B3) — окремо від requireAdmin()
 * (lib/adminAuth.ts), який перевіряє cookie-сесію /admin, а не токен.
 * Оновлює lastUsedAt при кожному успішному виклику (діагностика "хто й
 * коли останній раз тягнув дані").
 *
 * @param {Request} request
 * @returns {Promise<{ id: number, employeeId: number } | null>}
 */
export async function verifyApiToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const tokenHash = hashToken(match[1].trim());
  const token = await prisma.adminApiToken.findUnique({
    where: { tokenHash },
    include: { employee: { select: { isActive: true, role: true } } },
  });
  if (!token || token.revokedAt) return null;
  if (token.expiresAt && token.expiresAt.getTime() < Date.now()) return null;
  // Власник токена мусить і далі бути активним admin/hr_manager: до
  // 2026-09-27 токен звільненого чи пониженого HR і далі віддавав базу.
  if (!token.employee.isActive || !["admin", "hr_manager"].includes(token.employee.role)) return null;

  await prisma.adminApiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
  return { id: token.id, employeeId: token.employeeId };
}
