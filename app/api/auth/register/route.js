import { NextResponse } from "next/server";
import { requestLoginPin } from "@/lib/auth";
import { isDemoLoginEnabled, isDemoCode } from "@/lib/demoLogin";
import { clientIp, hitRateLimit, normalizeExternalCode, tooManyRequests } from "@/lib/loginThrottle";

/**
 * POST /api/auth/register
 * Body: { externalCode: string }
 *
 * Шаг 1 входа (было action:"register" в legacy registration.gs):
 * находит сотрудника по коду и шлёт PIN на почту его руководителя.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const raw = typeof body.externalCode === "string" ? body.externalCode.trim() : "";

  if (!raw) {
    return NextResponse.json({ ok: false, error: "missing_external_code" }, { status: 400 });
  }
  // Чужий формат (символи шаблону, задовгий рядок) — як неіснуючий код, без
  // жодного запиту до бази.
  const externalCode = normalizeExternalCode(raw);
  if (!externalCode) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // «Тестовий вхід»: PIN на пошту колеги. Дозволено лише коли задано
  // DEMO_LOGIN_CODES і код — з того списку (lib/demoLogin.ts); інакше
  // будь-хто міг би зайти під будь-ким, вказавши свою пошту.
  let recipientOverride = null;
  const demoEmail = String(body.demoEmail || "").trim().slice(0, 254);
  if (demoEmail) {
    if (!isDemoLoginEnabled() || !isDemoCode(externalCode)) {
      return NextResponse.json({ ok: false, error: "demo_not_allowed" }, { status: 403 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(demoEmail)) {
      return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
    }
    recipientOverride = demoEmail;
  }

  // Кожен виклик — це лист (сотруднику або його керівнику): без ліміту
  // цикл запитів засипав би пошту й за годину вичерпав денну квоту Gmail
  // SMTP, зламавши вхід усій компанії. Свіжий PIN (lib/auth.js) при
  // повторі не перегенеровується, тож чужі запити не «збивають» код
  // справжньому власнику.
  const [perCode, perIp] = await Promise.all([
    hitRateLimit(`pinreq:${externalCode.toLowerCase()}`, 5, 60 * 60 * 1000),
    hitRateLimit(`ip-pinreq:${clientIp(request)}`, 60, 60 * 60 * 1000),
  ]);
  const limited = !perCode.allowed ? perCode : !perIp.allowed ? perIp : null;
  if (limited) return tooManyRequests(limited.retryAt, "rate_limited");

  const result = await requestLoginPin(externalCode, "", { recipientOverride });
  const status = result.ok
    ? 200
    : result.error === "not_found"
      ? 404
      : result.error === "email_send_failed"
        ? 502 // не наша помилка, а провайдер листів - Bad Gateway точніше за 400
        : 400;
  return NextResponse.json(result, { status });
}
