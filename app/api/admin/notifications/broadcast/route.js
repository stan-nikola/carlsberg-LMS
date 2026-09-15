import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { sendBroadcast } from "@/lib/notifications";

/** GET — історія розсилок (останні 50). */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const broadcasts = await prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ broadcasts });
}

/**
 * POST — { title, message, url?, target: { all?|positionCodes?|territoryIds?|employeeIds? } }
 * Пише Broadcast + Notification кожному адресату + push. Заголовок ≤ 80,
 * текст ≤ 500 символів: системні сповіщення на телефоні обрізають довше.
 */
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const title = String(body.title || "").trim().slice(0, 80);
  const message = String(body.message || "").trim().slice(0, 500);
  const url = typeof body.url === "string" && body.url.startsWith("/") ? body.url.slice(0, 200) : null;
  const target = {
    all: body.target?.all === true,
    positionCodes: Array.isArray(body.target?.positionCodes) ? body.target.positionCodes.map(String) : [],
    territoryIds: Array.isArray(body.target?.territoryIds) ? body.target.territoryIds.map(Number).filter(Number.isInteger) : [],
    employeeIds: Array.isArray(body.target?.employeeIds) ? body.target.employeeIds.map(Number).filter(Number.isInteger) : [],
  };
  if (!title || !message) return NextResponse.json({ error: "Потрібні заголовок і текст" }, { status: 400 });

  try {
    const result = await sendBroadcast({ title, message, url, target });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
