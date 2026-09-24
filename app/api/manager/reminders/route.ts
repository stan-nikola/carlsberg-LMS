import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier, getAllSubordinates } from "@/lib/permissions";
import { notifyEmployees, splitByManagerTier } from "@/lib/notifications";
import { dateKey } from "@/lib/notificationLogic";

const MAX_RECIPIENTS = 100;
const MAX_MESSAGE = 500;

/**
 * POST /api/manager/reminders — «Нагадати» з кабінету керівника
 * (/manager, /manager/team): {employeeIds:number[], courseId:number|null,
 * message:string}. Іде тим самим notifyEmployees, що й cron-нагадування
 * (центр + push + Telegram, з повагою до вподобань адресата).
 *
 * Межі ієрархії — як у /api/manager/employees/[id]: усі адресати мають
 * бути в getAllSubordinates(керівник), admin-роль цього не обходить.
 * ponytail: захист від спаму — лише dedupeKey «керівник:людина:курс:день»
 * (один рядок на день; повтор мовчки пропускається й повертається як
 * skipped) плюс стеля на 100 адресатів; окремої таблиці лімітів нема.
 */
export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerTier(me)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { employeeIds?: unknown; courseId?: unknown; message?: unknown; kind?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const ids = Array.isArray(body.employeeIds) ? Array.from(new Set(body.employeeIds.map((v) => Number(v)))) : [];
  if (ids.length === 0 || ids.length > MAX_RECIPIENTS || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return NextResponse.json({ error: "Вкажіть від 1 до 100 адресатів" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE) {
    return NextResponse.json({ error: `Текст — від 1 до ${MAX_MESSAGE} символів` }, { status: 400 });
  }
  const courseId = body.courseId == null || body.courseId === "" ? null : Number(body.courseId);
  if (courseId != null && (!Number.isInteger(courseId) || courseId <= 0)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const subordinateIds = new Set(await getAllSubordinates(me.id));
  if (ids.some((id) => !subordinateIds.has(id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const course = courseId != null ? await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, slug: true } }) : null;
  if (courseId != null && !course) return NextResponse.json({ error: "Курс не знайдено" }, { status: 404 });

  // «Похвалити» (2026-09-24) — той самий маршрут і ті самі межі, лише
  // інший тип (категорія «курси», не «дедлайни») і власний ключ дедуплікації:
  // подяка й нагадування по одному курсу за день не мають гасити одне одного.
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
        dedupeKey: (id: number) => `reminder:${me.id}:${id}:${course ? course.id : "all"}:${dateKey(now)}`,
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

  return NextResponse.json({ sent: created, skipped: ids.length - created });
}
