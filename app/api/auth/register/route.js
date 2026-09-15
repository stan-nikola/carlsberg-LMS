import { NextResponse } from "next/server";
import { requestLoginPin } from "@/lib/auth";
import { isDemoLoginEnabled, isDemoCode } from "@/lib/demoLogin";

/**
 * POST /api/auth/register
 * Body: { externalCode: string }
 *
 * Шаг 1 входа (было action:"register" в legacy registration.gs):
 * находит сотрудника по коду и шлёт PIN на почту его руководителя.
 */
export async function POST(request) {
  const body = await request.json();
  const externalCode = (body.externalCode || "").trim();
  // Те саме, що вже введено у "Ваше ім'я" на екрані — на сервер лише для
  // ОДНОРАЗОВОГО показу в PIN-листі (хто саме заявив, що це він), у
  // Employee.name НЕ пишеться (лишається як було — з email, lib/auth.js).
  // Довільний текст від будь-кого до логіну — untrusted, тому cap 100
  // символів, той самий ліміт, що вже діє для localName (lib/localName.js).
  const name = (body.name || "").trim().slice(0, 100);

  if (!externalCode) {
    return NextResponse.json({ ok: false, error: "missing_external_code" }, { status: 400 });
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

  const result = await requestLoginPin(externalCode, name, { recipientOverride });
  const status = result.ok
    ? 200
    : result.error === "not_found"
      ? 404
      : result.error === "email_send_failed"
        ? 502 // не наша помилка, а провайдер листів - Bad Gateway точніше за 400
        : 400;
  return NextResponse.json(result, { status });
}
