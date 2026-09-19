import { prisma } from "@/lib/prisma";
import { notifyBadgeAwarded } from "@/lib/notifications";
import { recordBadgeAward } from "@/lib/rating";

// Авто-ачивки (Фаза C адмінки) — рахуються з РЕАЛЬНИХ даних
// (Enrollment/EnrollmentAttempt/Employee.firstLoginAt), той самий принцип,
// що вже є в lib/progress.js (medalTier): ніколи не вигадувати
// досягнення, лише показувати те, що дійсно сталось.
//
// "Серія з N днів" (стрік) свідомо НЕ тут — реальної щоденної активності
// зараз ніде не логується (лише timestamp'и окремих подій), для чесного
// підрахунку стріку потрібен новий облік (EmployeeActivityLog) — окрема
// майбутня підзадача, озвучена в плані, не мовчки пропущена.
// points — бали рейтингу за відзнаку при СТВОРЕННІ типу (далі адмін
// править у /admin/badges; upsert нижче наявні рядки не чіпає). «Перший
// вхід» і «Курс складено» — 0: вхід не заслуга, а курс уже дає бали сам.
const AUTO_BADGE_DEFINITIONS = [
  { code: "first_login", title: "Перший вхід", icon: "🎉", description: "Перший вхід у платформу", points: 0 },
  { code: "course_passed", title: "Курс складено", icon: "🏆", description: "Складено щонайменше один курс (80%+)", points: 0 },
  { code: "five_courses", title: "5 курсів пройдено", icon: "📚", description: "Складено 5 і більше курсів", points: 100 },
  {
    code: "no_mistakes",
    title: "Без помилок",
    icon: "🎯",
    description: "Курс складено на 100% з першої ж спроби",
    points: 50,
  },
];

/** Створює авто-типи ачивок, якщо їх ще нема (ідемпотентно — по code, і
 * не чіпає вже існуючі рядки, тож правки адміна в /admin/badges не
 * затираються). Викликається на КОЖЕН перегляд "Досягнень"
 * (getEmployeeBadgesView) — тому один round-trip (createMany
 * skipDuplicates), а не послідовні upsert по одному в циклі: 4 окремих
 * await-запити сюди й додавали ~900мс до кожного перегляду сторінки,
 * повністю ховаючись за unstable_cache лише в теорії (аудит швидкодії,
 * 2026-09-19 — на practике саме ця функція виявилась вузьким місцем, не
 * сам кеш-шар). */
export async function ensureAutoBadgesExist() {
  await prisma.badge.createMany({
    data: AUTO_BADGE_DEFINITIONS.map((def) => ({
      code: def.code,
      title: def.title,
      icon: def.icon,
      description: def.description,
      kind: "auto",
      ruleKey: def.code,
      points: def.points,
    })),
    skipDuplicates: true,
  });
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

  // createManyAndReturn — бали рейтингу і сповіщення лише за НОВІ нарахування
  // (ті, що skipDuplicates пропустив, людина отримала раніше й уже знає).
  const created = await prisma.employeeBadge.createManyAndReturn({
    data: awards.map((a) => ({ employeeId: a.employeeId, badgeId: a.badgeId, awardedById: null })),
    skipDuplicates: true,
    select: { employeeId: true, badgeId: true },
  });
  const badgeById = new Map(badges.map((b) => [b.id, b]));
  for (const c of created) {
    try {
      await recordBadgeAward(c.employeeId, badgeById.get(c.badgeId));
    } catch (err) {
      console.warn("[rating] auto badge:", err?.message);
    }
  }
  if (created.length > 0) {
    try {
      await notifyBadgeAwarded(created.map((c) => ({ employeeId: c.employeeId, badge: badgeById.get(c.badgeId) })));
    } catch (err) {
      console.warn("[notifications] auto badges:", err?.message);
    }
  }
  return { awardedCount: created.length };
}
