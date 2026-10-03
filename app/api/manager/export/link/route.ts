import { NextResponse } from "next/server";
import { getSessionClaims } from "@/lib/session";
import { signExportToken } from "@/lib/exportLink";

// GET /api/manager/export/link — свіжий ключ для посилання на Excel-звіт
// (lib/exportLink.ts). Лише підпис, без бази: чи це керівник і чи сесія ще
// жива, перевіряє сам /api/manager/export у момент завантаження.
export async function GET() {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ token: signExportToken(claims.employeeId, claims.version) }, { headers: { "Cache-Control": "no-store" } });
}
