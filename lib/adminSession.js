import crypto from "node:crypto";
import { safeEqual } from "@/lib/safeEqual";
import { getSecret } from "@/lib/session";
import { cookies } from "next/headers";
import { connection } from "next/server";

// Отдельная сессия для /admin — полностью независимая от employee-сессии
// (lib/session.js): вход по общему паролю ADMIN_PASSWORD (см.
// app/api/admin/login/route.js), без привязки к конкретному Employee/PIN.
// Та же схема подписанной cookie, что и в lib/session.js, просто без
// employeeId в payload — здесь нечего идентифицировать, кроме факта
// "кто-то ввёл правильный пароль".
const COOKIE_NAME = "admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 часов — рабочая смена, дальше перелогин


/**
 * Підпис включає відбиток ПОТОЧНОГО пароля свого рівня (у cookie його нема):
 * змінили ADMIN_PASSWORD/SUPER_ADMIN_PASSWORD — усі видані ним 12-годинні
 * сесії перестають діяти. Раніше для цього доводилось міняти SESSION_SECRET,
 * що заодно розлогінювало всіх співробітників.
 */
function sign(payload, marker) {
  const password = (marker === "super" ? process.env.SUPER_ADMIN_PASSWORD : process.env.ADMIN_PASSWORD) || "";
  return crypto.createHmac("sha256", getSecret()).update(`${payload}.${password}`).digest("hex");
}

/**
 * level: "admin" (ADMIN_PASSWORD) або "super" (SUPER_ADMIN_PASSWORD — бачить
 * і зберігає дизайн-систему /admin/design для всіх). Рівень зашито в
 * підписаний payload cookie, тож підмінити його без SESSION_SECRET не можна.
 */
export async function createAdminSession(level = "admin") {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const marker = level === "super" ? "super" : "admin";
  const payload = `${marker}.${expiresAt}`;
  const cookieValue = `${payload}.${sign(payload, marker)}`;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function destroyAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/**
 * Рівень поточної /admin-сесії: "super" | "admin" | null (нема/прострочена/
 * підроблена). Про employee-сесію не знає нічого.
 */
export async function getAdminLevel() {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value;
  if (!cookieValue) return null;

  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;
  const [marker, expiresAtPart, signature] = parts;
  if (marker !== "admin" && marker !== "super") return null;

  const expected = sign(`${marker}.${expiresAtPart}`, marker);
  if (!safeEqual(expected, signature)) return null;

  // Годинник під Cache Components не можна читати просто так: Date.now()
  // у пререндері — це «різна відповідь на однаковий вхід», і Next глушить
  // його помилкою навіть на маршруті з `instant = false` (opt-out знімає
  // перевірку запитних даних, але не читання часу). await connection()
  // — штатний спосіб сказати «далі рахуємо вже на живий запит»: у
  // роут-хендлерах він вирішується миттєво, а пререндер зупиняє саме тут.
  await connection();
  const expiresAt = Number(expiresAtPart);
  if (!expiresAt || Date.now() > expiresAt) return null;
  return marker;
}

/** true, если у текущего запроса валидная /admin-сессия (будь-який рівень). */
export async function isAdminAuthenticated() {
  return (await getAdminLevel()) !== null;
}

/** Лише супер-адмін (SUPER_ADMIN_PASSWORD). */
export async function isSuperAdmin() {
  return (await getAdminLevel()) === "super";
}
