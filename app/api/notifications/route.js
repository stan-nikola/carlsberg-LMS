import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

const PAGE_SIZE = 30;

/**
 * GET /api/notifications?cursor=<id> — стрічка сповіщень поточної людини
 * (новіші зверху) + кількість непрочитаних. Курсорна пагінація по id, а не
 * offset: список росте щодня, offset на великих сторінках «з'їжджає».
 */
export async function GET(request) {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const cursor = Number(searchParams.get("cursor")) || null;

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { employeeId: employee.id, ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: "desc" },
      take: PAGE_SIZE + 1,
      select: { id: true, type: true, category: true, title: true, message: true, url: true, isRead: true, createdAt: true },
    }),
    prisma.notification.count({ where: { employeeId: employee.id, isRead: false } }),
  ]);

  const hasMore = items.length > PAGE_SIZE;
  const page = hasMore ? items.slice(0, PAGE_SIZE) : items;
  return NextResponse.json({
    items: page,
    unreadCount,
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
