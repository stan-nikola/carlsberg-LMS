import { safeEqual } from "@/lib/safeEqual";
import { NextResponse } from "next/server";
import { createAdminSession } from "@/lib/adminSession";
import { auditAs } from "@/lib/audit";
import { clientIp, recordSuccess, registerAttempt, settleFailure, tooManyRequests } from "@/lib/loginThrottle";

/**
 * POST /api/admin/login
 * Body: { password: string }
 *
 * Отдельный вход в /admin по общему паролю (ADMIN_PASSWORD в .env, ключ
 * сюда не пишу — заводится вручную) — не связан с employee PIN-логином.
 *
 * Ліміт — на IP, а не один спільний ключ: раніше п'ять невірних паролів
 * звідки завгодно раз на 15 хвилин тримали замкненими ВСІХ адмінів.
 */
export async function POST(request) {
  const throttleKey = `admin-login:${clientIp(request)}`;
  const attempt = await registerAttempt(throttleKey);
  if (!attempt.allowed) return tooManyRequests(attempt.retryAt);

  const body = await request.json();
  const password = String(body.password || "");

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    // Не сконфигурировано — не пускаем никого, а не "любой пароль подходит".
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 500 });
  }

  const matches = (candidate) => safeEqual(candidate, password);

  // Той самий екран входу: SUPER_ADMIN_PASSWORD дає рівень "super"
  // (дизайн-система для всіх), ADMIN_PASSWORD — звичайний. Без окремого
  // поля/чекбокса — рівень визначає сам пароль.
  const level = matches(process.env.SUPER_ADMIN_PASSWORD) ? "super" : matches(expected) ? "admin" : null;
  if (!level) {
    const settled = await settleFailure(throttleKey, attempt.attempt);
    if (settled.locked) return tooManyRequests(settled.retryAt);
    await auditAs("admin", "admin.login_failed", "admin");
    return NextResponse.json({ ok: false, error: "invalid_password" }, { status: 401 });
  }

  await recordSuccess(throttleKey);
  await createAdminSession(level);
  await auditAs(level === "super" ? "super" : "admin", "admin.login", "admin");
  return NextResponse.json({ ok: true, level });
}
