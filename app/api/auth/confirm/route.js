import { NextResponse } from "next/server";
import { confirmLoginPin, invalidateLoginPin } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { clientIp, hitRateLimit, normalizeExternalCode, pinThrottleKey, recordSuccess, registerAttempt, settleFailure, tooManyRequests } from "@/lib/loginThrottle";
import { auditEmployee } from "@/lib/audit";

/**
 * POST /api/auth/confirm
 * Body: { externalCode: string, pin: string }
 *
 * Шаг 2 входа (было action:"confirm" в legacy registration.gs): сверяет
 * PIN, при успехе выдаёт сессию (cookie) и профиль сотрудника. Имя,
 * введённое на экране входа, сюда не отправляется вообще - см.
 * app/register/page.js, оно остаётся только в localStorage на
 * устройстве сотрудника, если у него нет email в базе.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const raw = typeof body.externalCode === "string" ? body.externalCode.trim() : "";
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";

  if (!raw || !pin) {
    return NextResponse.json(
      { ok: false, error: "missing_external_code_or_pin" },
      { status: 400 }
    );
  }
  // Лише літери й цифри — інакше % і _ давали окремий лічильник спроб на
  // кожне написання того самого коду (lib/loginThrottle.ts).
  const externalCode = normalizeExternalCode(raw);
  if (!externalCode) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // Загальний ліміт на IP — проти перебору PIN по багатьох кодах одразу
  // (по 5 спроб на кожен). Щедрий: мобільні оператори ховають за одним IP
  // (CGNAT) багато чужих людей.
  const ipLimit = await hitRateLimit(`ip-confirm:${clientIp(request)}`, 100, 15 * 60 * 1000);
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAt);

  // Спроба рахується ДО перевірки (lib/loginThrottle.ts) — інакше паралельна
  // пачка запитів проскакувала повз ліміт.
  const throttleKey = pinThrottleKey(externalCode);
  const attempt = await registerAttempt(throttleKey);
  if (!attempt.allowed) return tooManyRequests(attempt.retryAt);

  const result = await confirmLoginPin(externalCode, pin);
  if (!result.ok) {
    if (result.error !== "not_found") auditEmployee({ externalCode }, "auth.login_failed", undefined, { reason: result.error });
    if (result.error === "invalid_pin") {
      const settled = await settleFailure(throttleKey, attempt.attempt);
      // Після 5 помилок цей PIN більше не діє зовсім — навіть коли
      // блокування мине, вгадувати далі той самий PIN сенсу нема: потрібен
      // новий лист. Без цього PIN жив 12 годин і перебирався «по 5 за 15 хв».
      if (settled.locked) {
        await invalidateLoginPin(externalCode);
        return tooManyRequests(settled.retryAt, "locked_new_pin_required");
      }
    }
    // pin_expired — тоже 401 (не найдено что-то отдельное, PIN просто
    // больше не действителен), но полезно как отдельный код ошибки для UI.
    const status = result.error === "not_found" ? 404 : 401;
    return NextResponse.json(result, { status });
  }

  await recordSuccess(throttleKey);
  await createSession(result.employee.id, result.employee.sessionVersion);
  auditEmployee(result.employee.id, "auth.login");

  return NextResponse.json({
    ok: true,
    employee: {
      id: result.employee.id,
      name: result.employee.name,
      externalCode: result.employee.externalCode,
    },
  });
}
