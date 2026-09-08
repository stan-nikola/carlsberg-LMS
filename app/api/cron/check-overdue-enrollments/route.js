import { NextResponse } from "next/server";
import { markOverdueEnrollments } from "@/lib/overdueEnrollments";

// Вызывается Vercel Cron раз в день (см. vercel.json). Vercel сам
// подставляет заголовок Authorization: Bearer $CRON_SECRET, если в
// проекте задана переменная окружения CRON_SECRET — см.
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
// CRON_SECRET нужно будет задать в Vercel (Шаг 4 — подготовка к деплою).
export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await markOverdueEnrollments();
  return NextResponse.json(result);
}
