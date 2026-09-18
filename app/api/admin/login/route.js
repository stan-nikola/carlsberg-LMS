import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminSession } from "@/lib/adminSession";
import { checkThrottle, recordFailure, recordSuccess } from "@/lib/loginThrottle";

const THROTTLE_KEY = "admin-login";

/**
 * POST /api/admin/login
 * Body: { password: string }
 *
 * Отдельный вход в /admin по общему паролю (ADMIN_PASSWORD в .env, ключ
 * сюда не пишу — заводится вручную) — не связан с employee PIN-логином.
 */
export async function POST(request) {
  const throttle = await checkThrottle(THROTTLE_KEY);
  if (throttle.locked) {
    return NextResponse.json(
      { ok: false, error: "locked", retryAt: throttle.retryAt },
      { status: 429, headers: { "Retry-After": String(Math.ceil((throttle.retryAt.getTime() - Date.now()) / 1000)) } }
    );
  }

  const body = await request.json();
  const password = String(body.password || "");

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    // Не сконфигурировано — не пускаем никого, а не "любой пароль подходит".
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 500 });
  }

  const matches = (candidate) => {
    if (!candidate) return false;
    const providedBuf = Buffer.from(password);
    const expectedBuf = Buffer.from(candidate);
    return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
  };

  // Той самий екран входу: SUPER_ADMIN_PASSWORD дає рівень "super"
  // (дизайн-система для всіх), ADMIN_PASSWORD — звичайний. Без окремого
  // поля/чекбокса — рівень визначає сам пароль.
  const level = matches(process.env.SUPER_ADMIN_PASSWORD) ? "super" : matches(expected) ? "admin" : null;
  if (!level) {
    await recordFailure(THROTTLE_KEY);
    return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 401 });
  }

  await recordSuccess(THROTTLE_KEY);
  await createAdminSession(level);
  return NextResponse.json({ ok: true, level });
}
