import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getSessionClaims } from "@/lib/session";

const PAGE_SIZE = 30;

/**
 * Employee.lastSeenAt — «людина відкривала застосунок»: дзвіночок опитує
 * цей роут кожні 60с лише поки вкладка відкрита й видима, тож це чесний
 * сигнал присутності. Пишемо не частіше разу на годину і best-effort — збій
 * запису не має ламати відповідь.
 */
function touchLastSeen(where) {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  return prisma.employee
    .updateMany({ where: { ...where, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: hourAgo } }] }, data: { lastSeenAt: now } })
    .catch(() => null);
}

/**
 * GET /api/notifications?cursor=<id> — стрічка сповіщень поточної людини
 * (новіші зверху) + кількість непрочитаних. Курсорна пагінація по id, а не
 * offset: список росте щодня, offset на великих сторінках «з'їжджає».
 *
 * GET /api/notifications?count=1 — лише лічильник для дзвіночка
 * (NotificationBell, раз на хвилину): одне звернення до бази замість трьох
 * і без 31 сповіщення в тілі. Сесію (активність, відкликання) перевіряє сам
 * запит лічильника; відкликана сесія бачить 0.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("count") === "1") {
    const claims = await getSessionClaims();
    if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const me = { id: claims.employeeId, isActive: true, sessionVersion: claims.version };
    const [unreadCount] = await Promise.all([
      prisma.notification.count({ where: { employeeId: claims.employeeId, isRead: false, employee: me } }),
      touchLastSeen(me),
    ]);
    return NextResponse.json({ unreadCount });
  }

  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cursor = Number(searchParams.get("cursor")) || null;
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { employeeId: employee.id, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: "desc" },
      take: PAGE_SIZE + 1,
      select: { id: true, type: true, category: true, title: true, message: true, url: true, isRead: true, createdAt: true },
    }),
    prisma.notification.count({ where: { employeeId: employee.id, isRead: false } }),
    touchLastSeen({ id: employee.id }),
  ]);

  const hasMore = items.length > PAGE_SIZE;
  const page = hasMore ? items.slice(0, PAGE_SIZE) : items;
  return NextResponse.json({
    items: page,
    unreadCount,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
