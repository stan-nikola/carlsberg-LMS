import { NextResponse } from "next/server";
import { confirmLoginPin } from "@/lib/auth";
import { createSession } from "@/lib/session";

/**
 * POST /api/auth/confirm
 * Body: { externalCode: string, pin: string }
 *
 * Шаг 2 входа (было action:"confirm" в legacy registration.gs): сверяет
 * PIN, при успехе выдаёт сессию (cookie) и профиль сотрудника.
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

  const result = await confirmLoginPin(externalCode, pin);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : 401;
    return NextResponse.json(result, { status });
  }

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
