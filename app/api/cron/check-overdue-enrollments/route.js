import { NextResponse } from "next/server";
import { markOverdueEnrollments } from "@/lib/overdueEnrollments";
import { publishScheduledCourses } from "@/lib/courseAssignment";
import { evaluateAutoBadgesForAll } from "@/lib/badgeRules";

// Вызывается Vercel Cron раз в день (см. vercel.json). Vercel сам
// подставляет заголовок Authorization: Bearer $CRON_SECRET, если в
// проекте задана переменная окружения CRON_SECRET — см.
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
// CRON_SECRET нужно будет задать в Vercel (Шаг 4 — подготовка к деплою).
//
// Три независимых шага объединены в один cron (а не заведён отдельный в
// vercel.json) — все лёгкие и всем достаточно суточной точности; авто-
// нарахування ачивок (Фаза C, lib/badgeRules.js) безпечно повторювати
// щодня — @@unique([employeeId,badgeId]) + skipDuplicates не дає дублів.
export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const overdue = await markOverdueEnrollments();
  const published = await publishScheduledCourses();
  const badges = await evaluateAutoBadgesForAll();
  return NextResponse.json({ overdue, published, badges });
}
