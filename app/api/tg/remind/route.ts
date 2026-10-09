import { NextResponse } from "next/server";
import { auditEmployee } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { resolveTelegramEmployee } from "@/lib/telegram";
import { sendManagerReminder } from "@/lib/managerReminders";
import { managerReminderText } from "@/lib/notificationLogic";

/**
 * POST /api/tg/remind — «Нагадати» одній людині прямо з Mini App:
 * {initData, employeeId, courseSlug?, reason}. На відміну від
 * /api/manager/reminders (керівник сам править текст у діалозі на сайті),
 * тут — миттєва відправка готовим шаблоном (managerReminderText,
 * lib/notificationLogic.js): рішення користувача, 2026-09-28 — сенс
 * кнопки в Mini App саме в швидкості, без окремого кроку редагування.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const who = await resolveTelegramEmployee(body?.initData, { id: true, position: { select: { level: true } } });
  if (!who.ok) return NextResponse.json({ error: who.error }, { status: 401 });
  const me = who.employee;

  const employeeId = Number(body?.employeeId);
  if (!Number.isInteger(employeeId) || employeeId <= 0) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const courseSlug = typeof body?.courseSlug === "string" ? body.courseSlug : null;
  const course = courseSlug ? await prisma.course.findUnique({ where: { slug: courseSlug }, select: { id: true, title: true } }) : null;
  if (courseSlug && !course) return NextResponse.json({ error: "Курс не знайдено" }, { status: 404 });

  const reason = typeof body?.reason === "string" ? body.reason : "general";
  const message = managerReminderText(reason, course?.title ?? null, null);

  const result = await sendManagerReminder(me, {
    employeeIds: [employeeId],
    courseId: course?.id ?? null,
    message,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  auditEmployee(me.id, "manager.remind", { type: "employee", id: employeeId }, { via: "telegram", reason, course: course?.title ?? null, sent: result.sent });
  return NextResponse.json({ sent: result.sent, skipped: result.skipped });
}
