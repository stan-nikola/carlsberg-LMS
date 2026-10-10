import { DAY_MS, UKRAINE_TZ } from "@/lib/ukraineTime";
import { formatDate, formatTime } from "@/lib/localDate";
import { personKeyOf } from "@/lib/personPath";

/**
 * Як стрічка сповіщень у кабінеті керівника показує запис (рішення користувача,
 * 2026-10-10, за патернами LinkedIn/GitHub/Duolingo): групи за днями, короткий
 * час, кнопка дії за адресою, аватар людини замість іконки для подій про підлеглого.
 * Чисті функції без React і prisma — тестуються в lib/notificationView.test.ts.
 */

export type DayGroup = "today" | "yesterday" | "week" | "earlier";

export const DAY_GROUP_LABEL: Record<DayGroup, string> = {
  today: "Сьогодні",
  yesterday: "Вчора",
  week: "Цього тижня",
  earlier: "Раніше",
};

const DAY_GROUP_ORDER: DayGroup[] = ["today", "yesterday", "week", "earlier"];

/** «2026-10-10» у поясі показу — ключ дня, щоб порівнювати календарні дні, а не 24-годинні вікна. */
function dayKey(date: Date, zone: string | undefined): string {
  return date.toLocaleDateString("en-CA", { timeZone: zone });
}

export function dayGroupOf(date: Date | string, now: Date, zone: string | undefined = UKRAINE_TZ): DayGroup {
  const d = new Date(date);
  const key = dayKey(d, zone);
  if (key === dayKey(now, zone)) return "today";
  if (key === dayKey(new Date(now.getTime() - DAY_MS), zone)) return "yesterday";
  if (now.getTime() - d.getTime() < 7 * DAY_MS) return "week";
  return "earlier";
}

/** Записи у порядку стрічки → групи у порядку днів; порожні групи пропускаються. */
export function groupByDay<T extends { createdAt: Date | string }>(items: T[], now: Date, zone: string | undefined): { key: DayGroup; label: string; items: T[] }[] {
  const buckets = new Map<DayGroup, T[]>();
  for (const item of items) {
    const g = dayGroupOf(item.createdAt, now, zone);
    buckets.set(g, [...(buckets.get(g) ?? []), item]);
  }
  return DAY_GROUP_ORDER.filter((g) => buckets.has(g)).map((g) => ({ key: g, label: DAY_GROUP_LABEL[g], items: buckets.get(g)! }));
}

/** Сьогодні — «14:20», інакше — «09.10»: день уже каже заголовок групи. */
export function shortTime(date: Date | string, now: Date, zone: string | undefined = UKRAINE_TZ): string {
  return dayGroupOf(date, now, zone) === "today"
    ? formatTime(date, { hour: "2-digit", minute: "2-digit" }, zone)
    : formatDate(date, { day: "2-digit", month: "2-digit" }, zone);
}

/** Підпис кнопки дії за адресою запису; без адреси — кнопки нема. */
export function actionLabelFor(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/courses/")) return "Відкрити курс";
  if (personKeyOf(url) !== null) return "До людини";
  const path = url.split(/[?#]/)[0];
  if (path === "/manager/achievements" || path === "/hub/achievements") return "Відзнаки";
  if (path === "/manager/courses" || path === "/hub/learn") return "Курси";
  if (path === "/manager/team") return "Команда";
  if (path === "/manager" || path === "/hub") return "Дашборд";
  return "Відкрити";
}

/** Типи, де керівнику є сенс одразу нагадати людині. */
export const REMINDABLE_TYPES = new Set(["subordinate_course_failed", "subordinate_enrollment_overdue"]);
