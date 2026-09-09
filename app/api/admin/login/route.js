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

  const providedBuf = Buffer.from(password);
  const expectedBuf = Buffer.from(expected);
  const valid =
    providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);

  if (!valid) {
    return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}
