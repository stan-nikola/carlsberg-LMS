import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
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
    await audit("broadcast.send", "broadcast", result.broadcastId, { title, target, recipients: result.recipients, pushed: result.pushed });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

/**
 * DELETE — { ids: number[] }: відкликати розсилки. Разом із Broadcast
 * прибираються і рядки Notification, створені нею (dedupeKey
 * "broadcast:<id>:<employeeId>"), тобто повідомлення зникає і з центрів
 * сповіщень адресатів; вже доставлений системний push відкликати не можна.
 */
export async function DELETE(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids is required" }, { status: 400 });

  const notifications = await prisma.notification.deleteMany({
    where: { OR: ids.map((id) => ({ dedupeKey: { startsWith: `broadcast:${id}:` } })) },
  });
  const broadcasts = await prisma.broadcast.deleteMany({ where: { id: { in: ids } } });
  await audit("broadcast.delete", "broadcast", ids.length === 1 ? ids[0] : null, { ids, notificationsRemoved: notifications.count });
  return NextResponse.json({ removed: broadcasts.count, notificationsRemoved: notifications.count });
}
