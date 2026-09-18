import { NextResponse } from "next/server";
import { confirmLoginPin } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { checkThrottle, pinThrottleKey, recordFailure, recordSuccess } from "@/lib/loginThrottle";

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
  const body = await request.json();
  const externalCode = (body.externalCode || "").trim();
  const pin = (body.pin || "").trim();

  if (!externalCode || !pin) {
    return NextResponse.json(
      { ok: false, error: "missing_external_code_or_pin" },
      { status: 400 }
    );
  }

  // Лічильник — лише на сам код (не на введений PIN), і лише на реальну
  // спробу вгадати PIN (invalid_pin нижче) — щоб перебір 10 000 варіантів
  // 4-значного PIN (lib/auth.js) упирався в блокування, а не тривав
  // необмежено. not_found/deactivated/pin_expired лічильник не чіпають —
  // це не спроба вгадати PIN, а зовсім інша відповідь.
  const throttleKey = pinThrottleKey(externalCode);
  const throttle = await checkThrottle(throttleKey);
  if (throttle.locked) {
    return NextResponse.json(
      { ok: false, error: "locked", retryAt: throttle.retryAt },
      { status: 429, headers: { "Retry-After": String(Math.ceil((throttle.retryAt.getTime() - Date.now()) / 1000)) } }
    );
  }

  const result = await confirmLoginPin(externalCode, pin);
  if (!result.ok) {
    if (result.error === "invalid_pin") {
      await recordFailure(throttleKey);
    }
    // pin_expired — тоже 401 (не найдено что-то отдельное, PIN просто
    // больше не действителен), но полезно как отдельный код ошибки для UI.
    const status = result.error === "not_found" ? 404 : 401;
    return NextResponse.json(result, { status });
  }

  await recordSuccess(throttleKey);
  await createSession(result.employee.id);

  return NextResponse.json({
    ok: true,
    employee: {
      id: result.employee.id,
      name: result.employee.name,
      externalCode: result.employee.externalCode,
    },
  });
}
