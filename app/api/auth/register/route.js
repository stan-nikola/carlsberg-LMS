import { NextResponse } from "next/server";
import { requestLoginPin } from "@/lib/auth";

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

  if (!externalCode) {
    return NextResponse.json({ ok: false, error: "missing_external_code" }, { status: 400 });
  }

  const result = await requestLoginPin(externalCode);
  const status = result.ok
    ? 200
    : result.error === "not_found"
      ? 404
      : result.error === "email_send_failed"
        ? 502 // не наша помилка, а провайдер листів - Bad Gateway точніше за 400
        : 400;
  return NextResponse.json(result, { status });
}
