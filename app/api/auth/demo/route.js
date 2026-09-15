import { NextResponse } from "next/server";
import { getDemoLoginOptions } from "@/lib/demoLogin";

/**
 * GET /api/auth/demo — чи увімкнено «Тестовий вхід» і кого можна обрати
 * (lib/demoLogin.ts). Публічний: викликається з екрана входу до сесії.
 */
export async function GET() {
  return NextResponse.json(await getDemoLoginOptions());
}
