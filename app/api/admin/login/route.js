import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminSession } from "@/lib/adminSession";

/**
 * POST /api/admin/login
 * Body: { password: string }
 *
 * Отдельный вход в /admin по общему паролю (ADMIN_PASSWORD в .env, ключ
 * сюда не пишу — заводится вручную) — не связан с employee PIN-логином.
 */
export async function POST(request) {
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
    return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 401 });
  }

  await createAdminSession(level);
  return NextResponse.json({ ok: true, level });
}
