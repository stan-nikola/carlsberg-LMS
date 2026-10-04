import { NextResponse } from "next/server";
import { markOverdueEnrollments } from "@/lib/overdueEnrollments";
import { publishScheduledCourses, topUpTargetedAssignments } from "@/lib/courseAssignment";
import { evaluateAutoBadgesForAll } from "@/lib/badgeRules";
import { remindDeadlines, sendTeamDigests } from "@/lib/notifications";
import { secretMatches } from "@/lib/telegramLogic";
import { auditAs, purgeOldAuditEntries } from "@/lib/audit";
import { kyivHour } from "@/lib/kyivTime";

/**
 * Година запуску за Києвом (рішення користувача 2026-10-04: сповіщення —
 * о 9:00, не о 6:00). Vercel Cron рахує лише UTC, а Київ то UTC+3 (літо), то
 * UTC+2 (зима), тож у vercel.json два розклади — 06:00 і 07:00 UTC — і роут
 * працює лише в тому, що потрапив на 9-ту годину за Києвом; другий — нічого
 * не робить. `?force=1` — ручний запуск будь-коли.
 */
const RUN_AT_KYIV_HOUR = 9;

export const maxDuration = 300;

// Вызывается Vercel Cron раз в день (см. vercel.json). Vercel сам
// подставляет заголовок Authorization: Bearer $CRON_SECRET, если в
// проекте задана переменная окружения CRON_SECRET — см.
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
//
// Кроки в одному cron (а не окремі в vercel.json) — усі легкі, і всім досить
// добової точності; кожен ідемпотентний (skipDuplicates /
// Notification.dedupeKey), тож повторний запуск нічого не дублює. Порядок
// має значення: спершу прострочення (щоб дайджест керівнику вже їх
// бачив), потім публікація й доназначення курсів (породжують «Вам
// призначено»), нагадування про дедлайни, авто-ачивки і наостанок дайджест.
//
// Кожен крок — у власному try/catch (2026-09-27): раніше виняток у першому
// ж кроці мовчки скасовував нагадування, відзнаки й дайджест на цілу добу.
export async function GET(request) {
  // Незаданий CRON_SECRET — відмова, а не «Bearer undefined» як валідний ключ.
  const secret = process.env.CRON_SECRET;
  if (!secretMatches(secret && `Bearer ${secret}`, request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const hour = kyivHour();
  if (hour !== RUN_AT_KYIV_HOUR && new URL(request.url).searchParams.get("force") !== "1") {
    return NextResponse.json({ skipped: true, kyivHour: hour, runsAt: `${RUN_AT_KYIV_HOUR}:00 Europe/Kyiv` });
  }

  const steps = {
    overdue: markOverdueEnrollments,
    published: publishScheduledCourses,
    toppedUp: topUpTargetedAssignments,
    reminders: remindDeadlines,
    badges: evaluateAutoBadgesForAll,
    digests: sendTeamDigests,
    // Журнал дій: записи співробітників і системи старші за термін зберігання
    // (налаштовує супер-адмін на /admin/audit; дії адмінів — назавжди).
    auditPurge: purgeOldAuditEntries,
  };
  const result = {};
  let failed = false;
  for (const [name, run] of Object.entries(steps)) {
    try {
      result[name] = await run();
    } catch (err) {
      failed = true;
      result[name] = { error: err?.message || String(err) };
      console.error(`[cron] step ${name} failed:`, err);
    }
  }
  await auditAs("system", "system.cron", "system", null, result);
  return NextResponse.json(result, { status: failed ? 500 : 200 });
}
