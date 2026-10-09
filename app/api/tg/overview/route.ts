import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveTelegramEmployee } from "@/lib/telegram";
import { isManagerTier } from "@/lib/permissions";
import { getHubLearnData } from "@/lib/employeeProgress";
import { getManagerTeamRows } from "@/lib/managerOverview";
import { isOverdue } from "@/lib/progress";
import { formatDate } from "@/lib/coursePlan";
import { SEGMENT_META } from "@/lib/teamInsights";
import { reminderDedupeKey } from "@/lib/managerReminders";
import { viewerTimeZone } from "@/lib/viewerZone";

/**
 * POST /api/tg/overview — єдина точка даних для Mini App CarLS (app/tg).
 * Авторизація — НЕ cookie-сесія (Mini App живе у вебвʼю Telegram, своєї
 * сесії там нема): клієнт шле сирий `initData` від Telegram.WebApp, тут
 * він перевіряється (lib/telegramLogic.ts verifyInitData) і за ним же
 * (через TelegramLink.chatId — для приватного чату з ботом chat.id
 * дорівнює user.id, той самий факт Bot API, на якому тримається webhook)
 * шукається Employee. Лінку нема — 200 з {linked:false}, а не 401: людина
 * ще просто не підключала Telegram у профілі (звичайний стан, не помилка).
 *
 * Лише читання: жодного мутуючого запиту тут нема (окрім самого
 * «Нагадати», яке йде через уже наявний /api/manager/reminders).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const who = await resolveTelegramEmployee(body?.initData, { id: true, name: true, position: { select: { level: true } } });
  if (!who.ok && who.error === "invalid_init_data") return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });
  // Telegram ще не підключено в профілі — звичайний стан, не помилка.
  if (!who.ok) return NextResponse.json({ linked: false as const });
  const employee = who.employee;
  const zone = await viewerTimeZone();

  if (isManagerTier(employee)) {
    const { people } = await getManagerTeamRows(employee.id, zone);
    const needsReminder = people.filter((p) => p.segment === "overdue" || p.segment === "behind" || p.segment === "not_started" || p.segment === "inactive");
    // Той самий dedupeKey, що lib/managerReminders.ts (courseId завжди
    // null тут — Mini App нагадує "загалом", без конкретного курсу).
    // Показуємо стан "вже надіслано сьогодні" ОДРАЗУ при завантаженні,
    // а не після марного натискання "Нагадати" й відповіді сервера —
    // раніше дізнавались про денний ліміт лише постфактум (скарга
    // користувача, 2026-09-28).
    const now = new Date();
    const todayKeys = needsReminder.map((p) => reminderDedupeKey(employee.id, p.id, null, now));
    const already = todayKeys.length
      ? new Set(
          (await prisma.notification.findMany({ where: { dedupeKey: { in: todayKeys } }, select: { dedupeKey: true } })).map(
            (n) => n.dedupeKey
          )
        )
      : new Set<string | null>();
    return NextResponse.json({
      linked: true as const,
      role: "manager" as const,
      name: employee.name,
      people: people
        .filter((p) => p.segment !== null)
        .map((p) => ({
          id: p.id,
          name: p.name,
          positionName: p.positionName,
          segment: p.segment,
          segmentLabel: p.segment ? SEGMENT_META[p.segment].label : null,
          activityLabel: p.activityLabel,
          counts: p.counts,
          remindedToday: already.has(reminderDedupeKey(employee.id, p.id, null, now)),
        })),
    });
  }

  // getHubLearnData/isOverdue живуть у lib/*.js (allowJs, checkJs:false —
  // навмисно не типізовані заднім числом, CLAUDE.md), тож форма enrollment
  // тут описана мінімально, лише те, що реально читаємо нижче.
  type LearnEnrollment = {
    course: { slug: string; title: string; _count: { modules: number } };
    status: string;
    dueDate: string | Date | null;
    scorePercent: number | null;
    passed: boolean | null;
  };
  const { enrollments } = (await getHubLearnData(employee.id)) as { enrollments: LearnEnrollment[] };
  const now = new Date();
  return NextResponse.json({
    linked: true as const,
    role: "employee" as const,
    name: employee.name,
    courses: enrollments.map((e) => ({
      slug: e.course.slug,
      title: e.course.title,
      status: e.status,
      overdue: isOverdue(e, now),
      dueDateLabel: e.dueDate ? formatDate(new Date(e.dueDate), zone) : null,
      scorePercent: e.scorePercent,
      passed: e.passed,
      modulesTotal: e.course._count.modules,
    })),
  });
}
