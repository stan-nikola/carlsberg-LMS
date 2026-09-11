import { prisma } from "@/lib/prisma";

// Авто-ачивки (Фаза C адмінки) — рахуються з РЕАЛЬНИХ даних
// (Enrollment/EnrollmentAttempt/Employee.firstLoginAt), той самий принцип,
// що вже є в lib/progress.js (medalTier/computeXp): ніколи не вигадувати
// досягнення, лише показувати те, що дійсно сталось.
//
// "Серія з N днів" (стрік) свідомо НЕ тут — реальної щоденної активності
// зараз ніде не логується (лише timestamp'и окремих подій), для чесного
// підрахунку стріку потрібен новий облік (EmployeeActivityLog) — окрема
// майбутня підзадача, озвучена в плані, не мовчки пропущена.
const AUTO_BADGE_DEFINITIONS = [
  { code: "first_login", title: "Перший вхід", icon: "🎉", description: "Перший вхід у платформу" },
  { code: "course_passed", title: "Курс складено", icon: "🏆", description: "Складено щонайменше один курс (80%+)" },
  { code: "five_courses", title: "5 курсів пройдено", icon: "📚", description: "Складено 5 і більше курсів" },
  {
    code: "no_mistakes",
    title: "Без помилок",
    icon: "🎯",
    description: "Курс складено на 100% з першої ж спроби",
  },
];

/** Створює авто-типи ачивок, якщо їх ще нема (ідемпотентно — upsert по
 * code). Адмін після цього може змінити title/description/icon у
 * /admin/badges, ruleKey/kind лишаються тими самими (авто-правило
 * прив'язане саме до ruleKey, не до назви). */
export async function ensureAutoBadgesExist() {
  for (const def of AUTO_BADGE_DEFINITIONS) {
    await prisma.badge.upsert({
      where: { code: def.code },
      update: {},
      create: { code: def.code, title: def.title, icon: def.icon, description: def.description, kind: "auto", ruleKey: def.code },
    });
  }
}

/**
 * Прогонює всі авто-правила по ВСІХ співробітниках і видає відсутні
 * EmployeeBadge (@@unique([employeeId, badgeId]) — skipDuplicates рятує
 * від повторного нарахування при щоденному повторному прогоні, безпечно
 * викликати хоч щодня). Викликається з щоденного cron
 * (app/api/cron/check-overdue-enrollments/route.js) поруч із
 * markOverdueEnrollments/publishScheduledCourses.
 *
 * @returns {Promise<{ awardedCount: number }>}
 */
export async function evaluateAutoBadgesForAll() {
  await ensureAutoBadgesExist();
  const badges = await prisma.badge.findMany({ where: { kind: "auto" } });
  const badgeByCode = new Map(badges.map((b) => [b.ruleKey, b]));

  const awards = [];

  // "Перший вхід" — Employee.firstLoginAt вже реально проставляється при
  // підтвердженні PIN (lib/auth.js confirmLoginPin) — тут просто читаємо.
  const flBadge = badgeByCode.get("first_login");
  if (flBadge) {
    const loggedIn = await prisma.employee.findMany({ where: { firstLoginAt: { not: null } }, select: { id: true } });
    for (const e of loggedIn) awards.push({ employeeId: e.id, badgeId: flBadge.id });
  }

  // "Курс складено" / "5 курсів пройдено" — один groupBy замість запиту на
  // кожного співробітника.
  const cpBadge = badgeByCode.get("course_passed");
  const fcBadge = badgeByCode.get("five_courses");
  if (cpBadge || fcBadge) {
    const passedCounts = await prisma.enrollment.groupBy({
      by: ["employeeId"],
      where: { status: "completed", passed: true },
      _count: { _all: true },
    });
    for (const row of passedCounts) {
      if (cpBadge && row._count._all >= 1) awards.push({ employeeId: row.employeeId, badgeId: cpBadge.id });
      if (fcBadge && row._count._all >= 5) awards.push({ employeeId: row.employeeId, badgeId: fcBadge.id });
    }
  }

  // "Без помилок" — ПЕРША спроба (мінімальний createdAt) на конкретному
  // enrollment дала 100%. attemptNumber-поля в схемі нема — сортуємо самі
  // й беремо перший запис на enrollmentId.
  const nmBadge = badgeByCode.get("no_mistakes");
  if (nmBadge) {
    const attempts = await prisma.enrollmentAttempt.findMany({
      orderBy: [{ enrollmentId: "asc" }, { createdAt: "asc" }],
      select: { enrollmentId: true, scorePercent: true, enrollment: { select: { employeeId: true } } },
    });
    const seenEnrollment = new Set();
    for (const a of attempts) {
      if (seenEnrollment.has(a.enrollmentId)) continue;
      seenEnrollment.add(a.enrollmentId);
      if (a.scorePercent === 100) awards.push({ employeeId: a.enrollment.employeeId, badgeId: nmBadge.id });
    }
  }

  if (awards.length === 0) return { awardedCount: 0 };

  const result = await prisma.employeeBadge.createMany({
    data: awards.map((a) => ({ employeeId: a.employeeId, badgeId: a.badgeId, awardedById: null })),
    skipDuplicates: true,
  });
  return { awardedCount: result.count };
}
