import { NextResponse } from "next/server";
import { markOverdueEnrollments } from "@/lib/overdueEnrollments";
import { publishScheduledCourses } from "@/lib/courseAssignment";
import { evaluateAutoBadgesForAll } from "@/lib/badgeRules";
import { remindDeadlines, sendTeamDigests } from "@/lib/notifications";

// Вызывается Vercel Cron раз в день (см. vercel.json). Vercel сам
// подставляет заголовок Authorization: Bearer $CRON_SECRET, если в
// проекте задана переменная окружения CRON_SECRET — см.
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
//
// П'ять незалежних кроків в одному cron (а не окремі в vercel.json) — усі
// легкі, і всім досить добової точності; кожен ідемпотентний (skipDuplicates /
// Notification.dedupeKey), тож повторний запуск нічого не дублює. Порядок
// має значення: спершу прострочення (щоб дайджест керівнику вже їх
// бачив), потім публікація курсів (породжує «Вам призначено»), нагадування
// про дедлайни, авто-ачивки (породжують «Нова відзнака») і наостанок
// дайджест по команді.
export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const overdue = await markOverdueEnrollments();
  const published = await publishScheduledCourses();
  const reminders = await remindDeadlines();
  const badges = await evaluateAutoBadgesForAll();
  const digests = await sendTeamDigests();
  return NextResponse.json({ overdue, published, reminders, badges, digests });
}
