import { NextResponse } from "next/server";
import { auditEmployee } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

// Підписки на Web Push поточного співробітника (сесія-cookie, як і решта
// employee-роутів). Endpoint глобально унікальний: якщо той самий пристрій
// колись належав іншому акаунту на цьому телефоні (вийшли й увійшли
// іншим кодом), upsert переприв'язує його до нового власника — інакше
// push з чужими курсами прийшов би не тій людині.

// Лише справжні push-сервіси браузерів: сервер сам шле POST на endpoint
// (lib/webPush.js), і довільний https://-адрес робив із нас проксі для
// запитів на будь-який хост (SSRF, аудит 2026-09-27).
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/i;

function isPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.test(url.hostname);
  } catch {
    return false;
  }
}

function parseSubscription(body) {
  const s = body?.subscription;
  const endpoint = s?.endpoint;
  const p256dh = s?.keys?.p256dh;
  const auth = s?.keys?.auth;
  if (typeof endpoint !== "string" || !isPushEndpoint(endpoint)) return null;
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
      await tx.pushSubscription.deleteMany({ where: { endpoint: body.replacesEndpoint, employeeId: employee.id } });
    }
    await tx.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      update: { employeeId: employee.id, p256dh: sub.p256dh, auth: sub.auth, userAgent },
      create: { employeeId: employee.id, ...sub, userAgent },
    });
  });

  auditEmployee(employee.id, "profile.push_subscribe");
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
  auditEmployee(employee.id, "profile.push_unsubscribe");
  return NextResponse.json({ ok: true });
}
