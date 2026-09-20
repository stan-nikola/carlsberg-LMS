import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 30;

/**
 * Перша сторінка стрічки сповіщень + лічильник непрочитаних — те, що
 * реально потрібно ОДРАЗУ при відкритті /manager/notifications чи
 * /hub/notifications. Раніше NotificationCenter.jsx тягнув це звичайним
 * client-side fetch() у useEffect на кожному монтуванні — той самий баг-
 * клас, що вже виправлений для /manager (аудит "вообще без скелетонов
 * мгновенно", 2026-09-20): JSON-відповідь Route Handler не бере участі в
 * client Router Cache, тож ці дві вкладки завжди показували порожній
 * список + скелетон на кожен перехід.
 *
 * "seconds" (stale:30с, revalidate:1с, expire:1хв), не "minutes" — на
 * відміну від enrollments/rating, сповіщення реальночасовіші (push і
 * NotificationBell уже опитують стан), і тут навмисно НЕ підв'язана
 * revalidateTag на кожен виклик notifyEmployees() (багато точок
 * створення — курс, бейдж, розсилка, cron): коротка стеля кешу сама
 * тримає список свіжим без ризику розсинхрону.
 *
 * Пагінація "Показати ще" (cursor не null) лишається звичайним
 * client-side fetch — вона й так по кліку, не на монтуванні.
 */
export async function getNotificationFeed(employeeId) {
  "use cache: private";
  cacheLife("seconds");
  cacheTag("notifications");

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { employeeId },
      orderBy: { id: "desc" },
      take: PAGE_SIZE + 1,
      select: { id: true, type: true, category: true, title: true, message: true, url: true, isRead: true, createdAt: true },
    }),
    prisma.notification.count({ where: { employeeId, isRead: false } }),
  ]);

  const hasMore = items.length > PAGE_SIZE;
  const page = hasMore ? items.slice(0, PAGE_SIZE) : items;
  return { items: page, unreadCount, nextCursor: hasMore ? page[page.length - 1].id : null };
}
