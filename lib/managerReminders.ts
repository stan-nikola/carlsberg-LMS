import { prisma } from "@/lib/prisma";
import { isManagerTier, getAllSubordinates } from "@/lib/permissions";
import { notifyEmployees, splitByManagerTier } from "@/lib/notifications";
import { dateKey } from "@/lib/notificationLogic";

const MAX_RECIPIENTS = 100;
const MAX_MESSAGE = 500;

export type ReminderResult =
  | { ok: true; sent: number; skipped: number }
  | { ok: false; status: number; error: string };

/**
 * Спільна логіка «Нагадати»/«Похвалити» — раніше жила тільки в
 * app/api/manager/reminders/route.ts (кабінет керівника, cookie-сесія).
 * Винесено сюди без змін поведінки, щоб той самий шлях узяв і Mini App
 * (app/api/tg/remind/route.ts), де сесії нема — авторизація там через
 * initData, а не cookie, тож caller сам вирішує ХТО керівник (me) і
 * ПЕРЕДАЄ вже перевірений employeeId, а не читає сесію звідси.
 */
export async function sendManagerReminder(
  me: { id: number; position?: { level: number } | null },
  body: { employeeIds?: unknown; courseId?: unknown; message?: unknown; kind?: unknown }
): Promise<ReminderResult> {
  if (!isManagerTier(me)) return { ok: false, status: 403, error: "Forbidden" };

  const ids = Array.isArray(body.employeeIds) ? Array.from(new Set(body.employeeIds.map((v) => Number(v)))) : [];
  if (ids.length === 0 || ids.length > MAX_RECIPIENTS || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { ok: false, status: 400, error: "Вкажіть від 1 до 100 адресатів" };
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE) {
    return { ok: false, status: 400, error: `Текст — від 1 до ${MAX_MESSAGE} символів` };
  }
  const courseId = body.courseId == null || body.courseId === "" ? null : Number(body.courseId);
  if (courseId != null && (!Number.isInteger(courseId) || courseId <= 0)) {
    return { ok: false, status: 400, error: "Bad request" };
  }

  const subordinateIds = new Set(await getAllSubordinates(me.id));
  if (ids.some((id) => !subordinateIds.has(id))) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  const course =
    courseId != null ? await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, slug: true } }) : null;
  if (courseId != null && !course) return { ok: false, status: 404, error: "Курс не знайдено" };

  const praise = body.kind === "praise";
  const now = new Date();
  const base = praise
    ? {
        type: "manager_praise",
        title: course ? `Відзнака від керівника: «${course.title}»` : "Відзнака від керівника",
        message,
        dedupeKey: (id: number) => `praise:${me.id}:${id}:${course ? course.id : "all"}:${dateKey(now)}`,
      }
    : {
        type: "manager_reminder",
        title: course ? `Нагадування від керівника: «${course.title}»` : "Нагадування від керівника",
        message,
        dedupeKey: (id: number) => reminderDedupeKey(me.id, id, course?.id ?? null, now),
      };

  let created = 0;
  if (course) {
    const r = await notifyEmployees(ids, { ...base, url: `/courses/${course.slug}` });
    created = r.created;
  } else {
    const { managers, others } = await splitByManagerTier(ids);
    const [rm, ro] = await Promise.all([
      managers.length ? notifyEmployees(managers, { ...base, url: "/manager/courses" }) : { created: 0 },
      others.length ? notifyEmployees(others, { ...base, url: "/hub/learn" }) : { created: 0 },
    ]);
    created = rm.created + ro.created;
  }

  return { ok: true, sent: created, skipped: ids.length - created };
}

/** Ключ «одне нагадування людині від керівника на день» — і для відправки, і для показу «вже надіслано» в Mini App. */
export function reminderDedupeKey(managerId: number, employeeId: number, courseId: number | null, now: Date): string {
  return `reminder:${managerId}:${employeeId}:${courseId ?? "all"}:${dateKey(now)}`;
}
