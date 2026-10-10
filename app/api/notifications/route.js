import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getSessionClaims } from "@/lib/session";
import { auditEmployee } from "@/lib/audit";
import { withPeople } from "@/lib/notificationFeed";

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
    .then((r) => {
      // Той самий сигнал — і в журнал «Активність»: запис лише тоді, коли
      // lastSeenAt справді оновився, тобто не частіше разу на годину.
      if (r.count > 0) auditEmployee(where.id, "activity.visit");
      return r;
    })
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
  const page = await withPeople(hasMore ? items.slice(0, PAGE_SIZE) : items);
  return NextResponse.json({
    items: page,
    unreadCount,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}

/**
 * DELETE /api/notifications — { ids: number[] } або { all: true }. Видаляє ЛИШЕ свої
 * сповіщення (where employeeId) — чужі id ігноруються. Кнопка «×» і «Очистити все»
 * у центрі сповіщень кабінету керівника. Центр читає перший екран із кешу
 * (lib/notificationFeed.ts), тож тег скидаємо одразу.
 */
export async function DELETE(request) {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const where = { employeeId: employee.id };
  if (body.all !== true) {
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger) : [];
    if (ids.length === 0) return NextResponse.json({ error: "ids or all required" }, { status: 400 });
    where.id = { in: ids };
  }
  const r = await prisma.notification.deleteMany({ where });
  revalidateTag("notifications", { expire: 0 });
  return NextResponse.json({ deleted: r.count });
}
