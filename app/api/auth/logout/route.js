import { NextResponse } from "next/server";
import { destroySession, getSessionClaims } from "@/lib/session";
import { auditEmployee } from "@/lib/audit";

// POST /api/auth/logout — аналог logoutBtn из legacy (там просто чистил
// localStorage); здесь удаляет серверную cookie-сессию.
export async function POST() {
  const claims = await getSessionClaims();
  await destroySession();
  auditEmployee(claims?.employeeId, "auth.logout");
  return NextResponse.json({ ok: true });
}
