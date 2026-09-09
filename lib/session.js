import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 дней

// SESSION_SECRET нужно завести самостоятельно в .env (любая длинная случайная
// строка, например `openssl rand -hex 32`) — сюда его не вписываю.
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

/**
 * Простая подписанная cookie-сессия (employeeId + срок действия + HMAC-
 * подпись) вместо внешней библиотеки: payload не секретный, важно только,
 * чтобы его нельзя было подделать без SESSION_SECRET.
 *
 * Заменяет временную x-user-id-заглушку из ШАГ 2 — используйте
 * getCurrentUser() везде, где раньше читали пользователя из заголовка.
 */
export async function createSession(employeeId) {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${employeeId}.${expiresAt}`;
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

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

function verifyCookieValue(cookieValue) {
  if (!cookieValue) return null;

  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;
  const [employeeIdPart, expiresAtPart, signature] = parts;

  const expected = sign(`${employeeIdPart}.${expiresAtPart}`);
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return null;
  if (!crypto.timingSafeEqual(expectedBuf, signatureBuf)) return null;

  const expiresAt = Number(expiresAtPart);
  if (!expiresAt || Date.now() > expiresAt) return null;

  const employeeId = Number(employeeIdPart);
  return employeeId || null;
}

/**
 * Читает и проверяет сессию из cookie текущего запроса, возвращает
 * Employee (с ролью, для hasFullAccess) или null, если сессии нет/невалидна.
 */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const employeeId = verifyCookieValue(cookieStore.get(COOKIE_NAME)?.value);
  if (!employeeId) return null;

  return prisma.employee.findUnique({ where: { id: employeeId } });
}
