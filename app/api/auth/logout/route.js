import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

// POST /api/auth/logout — аналог logoutBtn из legacy (там просто чистил
// localStorage); здесь удаляет серверную cookie-сессию.
export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
