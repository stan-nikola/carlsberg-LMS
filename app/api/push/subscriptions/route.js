import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Підписки на Web Push поточного співробітника (сесія-cookie, як і решта
// employee-роутів). Endpoint глобально унікальний: якщо той самий пристрій
// колись належав іншому акаунту на цьому телефоні (вийшли й увійшли
// іншим кодом), upsert переприв'язує його до нового власника — інакше
// push з чужими курсами прийшов би не тій людині.

function parseSubscription(body) {
  const s = body?.subscription;
  const endpoint = s?.endpoint;
  const p256dh = s?.keys?.p256dh;
  const auth = s?.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) return null;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  return { endpoint, p256dh, auth };
}

export async function POST(request) {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const sub = parseSubscription(body);
  if (!sub) return NextResponse.json({ error: "Некоректна підписка" }, { status: 400 });

  const userAgent = request.headers.get("user-agent")?.slice(0, 255) || null;

  await prisma.$transaction(async (tx) => {
    // pushsubscriptionchange у service worker: старий endpoint помер —
    // прибираємо його, щоб не слати в порожнечу.
    if (typeof body.replacesEndpoint === "string") {
      await tx.pushSubscription.deleteMany({ where: { endpoint: body.replacesEndpoint } });
    }
    await tx.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { employeeId: employee.id, p256dh: sub.p256dh, auth: sub.auth, userAgent },
      create: { employeeId: employee.id, ...sub, userAgent },
    });
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (typeof endpoint !== "string") return NextResponse.json({ error: "endpoint is required" }, { status: 400 });

  // Лише свою — чужий endpoint (навіть якщо вгадали) не чіпаємо.
  await prisma.pushSubscription.deleteMany({ where: { endpoint, employeeId: employee.id } });
  return NextResponse.json({ ok: true });
}
