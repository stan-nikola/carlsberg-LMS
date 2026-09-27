import { NextResponse } from "next/server";
import type { PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { verifyInitData } from "@/lib/telegramLogic";
import { sendManagerReminder } from "@/lib/managerReminders";
import { managerReminderText } from "@/lib/notificationLogic";

const prisma = prismaUntyped as PrismaClient;

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
  const verified = verifyInitData(body?.initData, process.env.TELEGRAM_BOT_TOKEN);
  if (!verified.ok) return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });

  const link = await prisma.telegramLink.findUnique({
    where: { chatId: String(verified.user.id) },
    select: { employeeId: true },
  });
  if (!link) return NextResponse.json({ error: "not_linked" }, { status: 401 });

  const me = await prisma.employee.findFirst({
    where: { id: link.employeeId, isActive: true },
    select: { id: true, position: { select: { level: true } } },
  });
  if (!me) return NextResponse.json({ error: "not_linked" }, { status: 401 });

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
  return NextResponse.json({ sent: result.sent, skipped: result.skipped });
}
