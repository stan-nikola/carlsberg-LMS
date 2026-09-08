import crypto from "node:crypto";
import { cookies } from "next/headers";

// Отдельная сессия для /admin — полностью независимая от employee-сессии
// (lib/session.js): вход по общему паролю ADMIN_PASSWORD (см.
// app/api/admin/login/route.js), без привязки к конкретному Employee/PIN.
// Та же схема подписанной cookie, что и в lib/session.js, просто без
// employeeId в payload — здесь нечего идентифицировать, кроме факта
// "кто-то ввёл правильный пароль".
const COOKIE_NAME = "admin_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 часов — рабочая смена, дальше перелогин

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set");
  }
  return secret;
}

function sign(payload) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export async function createAdminSession() {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `admin.${expiresAt}`;
  const cookieValue = `${payload}.${sign(payload)}`;

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
 * true, если у текущего запроса валидная /admin-сессия (правильный пароль
 * и срок ещё не вышел) — не проверяет вообще ничего про employee-сессию.
 */
export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value;
  if (!cookieValue) return false;

  const parts = cookieValue.split(".");
  if (parts.length !== 3) return false;
  const [marker, expiresAtPart, signature] = parts;
  if (marker !== "admin") return false;

  const expected = sign(`${marker}.${expiresAtPart}`);
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  if (!crypto.timingSafeEqual(expectedBuf, signatureBuf)) return false;

  const expiresAt = Number(expiresAtPart);
  return Boolean(expiresAt) && Date.now() <= expiresAt;
}
