import crypto from "node:crypto";
import { safeEqual } from "@/lib/safeEqual";
import { cache } from "react";
import { cookies } from "next/headers";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isManagerTier } from "@/lib/permissions";

// Тег кешу сесії (getCurrentUser нижче) — скидається при вході/виході,
// щоб браузер не ніс у App Shell профіль ПОПЕРЕДНЬОГО користувача.
const SESSION_CACHE_TAG = "session";

const COOKIE_NAME = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 дней

// SESSION_SECRET нужно завести самостоятельно в .env (любая длинная случайная
// строка, например `openssl rand -hex 32`) — сюда его не вписываю.
/** Секрет підпису cookie (і сесії співробітника, і admin_session). */
export function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return secret;
}

function sign(payload) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

/**
 * Простая подписанная cookie-сессия (employeeId + срок действия + HMAC-
 * подпись) вместо внешней библиотеки: payload не секретный, важно только,
 * чтобы его нельзя было подделать без SESSION_SECRET.
 *
 * Заменяет временную x-user-id-заглушку из ШАГ 2 — используйте
 * getCurrentUser() везде, где раньше читали пользователя из заголовка.
 */
export async function createSession(employeeId, sessionVersion = 0) {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${employeeId}.${expiresAt}.${sessionVersion}`;
  const cookieValue = `${payload}.${sign(payload)}`;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
  // Обидва виклики — лише з Route Handlers (confirm/logout), де
  // revalidateTag дозволений; expire:0 — та сама форма, що вже для
  // enrollments у lib/employeeProgress.js.
  revalidateTag(SESSION_CACHE_TAG, { expire: 0 });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  revalidateTag(SESSION_CACHE_TAG, { expire: 0 });
}

/**
 * Скинути кеш сесії після зміни ВЛАСНИХ даних співробітника (ім'я, фото
 * профілю). getCurrentUser() кешований на хвилини, тож інакше нове фото
 * бачила лише сама сторінка профілю, яка щойно оновила стан у себе
 * локально, а головна й кабінет показували старе до кінця кешу або до
 * перезаходу в застосунок (скарга користувача, 2026-09-23).
 *
 * Лише з Route Handler / Server Action — там, де revalidateTag дозволений.
 */
export function revalidateSession() {
  revalidateTag(SESSION_CACHE_TAG, { expire: 0 });
}

/**
 * Формат: `id.expiresAt.version.sig`. version = Employee.sessionVersion на
 * момент входу — адмін збільшує його при деактивації/зміні пошти чи ролі,
 * і всі видані раніше cookie перестають діяти (до 2026-09-27 сесію не можна
 * було відкликати: звільнений жив із доступом до /manager ще 30 днів).
 * Старі cookie з трьох частин (`id.expiresAt.sig`) читаються як version 0 —
 * інакше деплой розлогінив би всіх.
 */
function verifyCookieValue(cookieValue) {
  if (!cookieValue) return null;

  const parts = cookieValue.split(".");
  if (parts.length !== 3 && parts.length !== 4) return null;
  const signature = parts.pop();
  const [employeeIdPart, expiresAtPart, versionPart = "0"] = parts;

  const expected = sign(parts.join("."));
  if (!safeEqual(expected, signature)) return null;

  const expiresAt = Number(expiresAtPart);
  if (!expiresAt || Date.now() > expiresAt) return null;

  const employeeId = Number(employeeIdPart);
  const version = Number(versionPart);
  if (!employeeId || !Number.isInteger(version)) return null;
  return { employeeId, version };
}

/**
 * Читает и проверяет сессию из cookie текущего запроса, возвращает
 * Employee (с ролью, для hasFullAccess) или null, если сессии нет/невалидна.
 *
 * include: { position: true, manager: true } — position потрібно для
 * isManagerTier() (lib/permissions.js, дивиться на employee.position.level)
 * при гейті /hub ↔ /manager; manager — сторінкам "Профіль" (hub і manager),
 * які раніше самі робили ДРУГИЙ findUnique за тим самим employeeId лише
 * заради цього зв'язку (аудит швидкодії, 2026-09-19). Безпечне розширення:
 * усі наявні виклики читають лише скалярні поля/role, зв'язки, що додались,
 * їм не заважають.
 *
 * React cache() — той самий request-scoped memo, що офіційний приклад
 * getUser() у Next.js docs (authentication.md): і layout, і page кожного
 * маршруту /hub, /manager, /courses/[slug] викликають getCurrentUser()
 * незалежно (2-3 рази за одну навігацію), і без кешу це стільки ж зайвих
 * SELECT-ів у Postgres щоразу. cache() дедуплікує виклики БЕЗ аргументів
 * у межах одного рендеру запиту — другий і третій виклик повертають той
 * самий Promise, реального запиту вже нема.
 */
async function loadCurrentUser() {
  // "use cache: private" замість `await connection()` (2026-09-22). Раніше
  // connection() робив цей виклик ДИНАМІЧНИМ — а він стоїть першим рядком
  // у КОЖНОМУ page.js хаба й кабінету, тож App Shell (partialPrefetching)
  // упирався в нього на кожній навігації і сторінка щоразу йшла на
  // сервер: живий замір на Vercel — ~0.8с зі скелетоном навіть на щойно
  // відвідану вкладку. Це рівно той випадок, що дока optimizing-prefetching
  // описує для private: "session helpers that read cookies deep inside
  // their own code" — cookies() і Date.now() (термін дії в
  // verifyCookieValue) живуть усередині кеш-межі, результат кешується в
  // браузері, scoped до сесії, і App Shell несе його ще до кліку.
  // cacheLife("minutes") — stale 5хв, мінімум, з яким shell узагалі бере
  // значення. Вхід/вихід скидають тег нижче.
  "use cache: private";
  cacheLife("minutes");
  cacheTag(SESSION_CACHE_TAG);

  const cookieStore = await cookies();
  const session = verifyCookieValue(cookieStore.get(COOKIE_NAME)?.value);
  if (!session) return null;

  // isActive і sessionVersion — тут, а не лише при вході: інакше
  // деактивований співробітник лишався в системі до кінця 30-денної cookie.
  // PIN-поля не вибираються ніколи (і в керівника теж): одна передача
  // `user` у клієнтський компонент віддала б підлеглому живий PIN керівника.
  return prisma.employee.findFirst({
    where: { id: session.employeeId, isActive: true, sessionVersion: session.version },
    omit: { loginPin: true, pinIssuedAt: true },
    include: { position: true, manager: { omit: { loginPin: true, pinIssuedAt: true } } },
  });
}

export const getCurrentUser = cache(loadCurrentUser);

/**
 * Лише підпис і термін cookie, БЕЗ запиту до бази — для гарячого маршруту
 * відповіді на питання (lib/moduleAttempts.ts answerQuestion): там
 * isActive/sessionVersion перевіряє той самий запит, що читає призначення,
 * і окремий findFirst з посадою й керівником був зайвим зверненням до бази.
 */
export async function getSessionClaims() {
  const cookieStore = await cookies();
  return verifyCookieValue(cookieStore.get(COOKIE_NAME)?.value);
}

/**
 * Початок роуту кабінету керівника: є сесія і посада керівницького рівня.
 *   const { manager, denied } = await requireManager();
 *   if (denied) return denied;
 */
export async function requireManager() {
  const manager = await getCurrentUser();
  if (!manager) return { manager: null, denied: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isManagerTier(manager)) return { manager: null, denied: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return { manager, denied: null };
}
