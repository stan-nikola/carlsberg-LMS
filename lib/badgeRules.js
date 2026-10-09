import { prisma } from "@/lib/prisma";
import { notifyBadgeAwarded } from "@/lib/notifications";
import { recordBadgeAwards } from "@/lib/rating";

// Авто-ачивки (Фаза C адмінки) — рахуються з РЕАЛЬНИХ даних
// (Enrollment/EnrollmentAttempt/Employee.firstLoginAt), той самий принцип,
// що вже є в lib/progress.ts (medalTier): ніколи не вигадувати
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
  return evaluateAutoBadges();
}

/**
 * Ті самі правила для ОДНІЄЇ людини — одразу після події, а не наступного
 * ранку (2026-10-04, скарга користувача: «5 курсів пройдено» приходило лише з
 * щоденним cron). Викликається після закриття курсу (lib/moduleAttempts.ts
 * finalizeEnrollment) і після входу (app/api/auth/confirm) — уже після
 * відповіді людині. Щоденний cron лишається страховкою для всіх.
 *
 * @param {number} employeeId
 */
export async function evaluateAutoBadgesForEmployee(employeeId) {
  return evaluateAutoBadges({ employeeId });
}

/** @param {{ employeeId?: number }} [scope] — без employeeId — уся компанія. */
async function evaluateAutoBadges({ employeeId } = {}) {
  const only = employeeId ? { employeeId } : {};
  const badges = await prisma.badge.findMany({ where: { kind: "auto" } });
  const badgeByCode = new Map(badges.map((b) => [b.ruleKey, b]));

  const awards = [];

  // "Перший вхід" — Employee.firstLoginAt вже реально проставляється при
  // підтвердженні PIN (lib/auth.js confirmLoginPin) — тут просто читаємо.
  const flBadge = badgeByCode.get("first_login");
  if (flBadge) {
    // Лише ті, хто її ще не має: інакше щодня заново пропонувалась уся
    // компанія, і список лише ріс (аудит запитів, 2026-10-03).
    const loggedIn = await prisma.employee.findMany({
      where: { ...(employeeId ? { id: employeeId } : {}), firstLoginAt: { not: null }, badgesReceived: { none: { badgeId: flBadge.id } } },
      select: { id: true },
    });
    for (const e of loggedIn) awards.push({ employeeId: e.id, badgeId: flBadge.id });
  }

  // "Курс складено" / "5 курсів пройдено" — один groupBy замість запиту на
  // кожного співробітника.
  const cpBadge = badgeByCode.get("course_passed");
  const fcBadge = badgeByCode.get("five_courses");
  if (cpBadge || fcBadge) {
    const passedCounts = await prisma.enrollment.groupBy({
      by: ["employeeId"],
      where: { ...only, status: "completed", passed: true },
      _count: { _all: true },
    });
    for (const row of passedCounts) {
      if (cpBadge && row._count._all >= 1) awards.push({ employeeId: row.employeeId, badgeId: cpBadge.id });
      if (fcBadge && row._count._all >= 5) awards.push({ employeeId: row.employeeId, badgeId: fcBadge.id });
    }
  }

  // "Без помилок" — курс на 100%, і КОЖЕН модуль пройдено одним заходом
  // (2026-09-27). Раніше дивились на першу відправку /submit курсу, але
  // модуль до неї можна було провалити кілька разів — бейдж отримував той,
  // хто помилявся. З «найкращий результат перемагає» модуль на 100% з
  // attemptCount 1 — рівно «жодної помилки з першого разу».
  const nmBadge = badgeByCode.get("no_mistakes");
  if (nmBadge) {
    const perfect = await prisma.enrollment.findMany({
      where: { ...only, status: "completed", passed: true, scorePercent: 100 },
      select: { employeeId: true, moduleCompletions: { select: { attemptCount: true, scorePercent: true } } },
    });
    for (const e of perfect) {
      const flawless =
        e.moduleCompletions.length > 0 && e.moduleCompletions.every((m) => m.attemptCount === 1 && m.scorePercent === 100);
      if (flawless) awards.push({ employeeId: e.employeeId, badgeId: nmBadge.id });
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
  try {
    await recordBadgeAwards(created.map((c) => ({ employeeId: c.employeeId, badge: badgeById.get(c.badgeId) })));
  } catch (err) {
    console.warn("[rating] auto badge:", err?.message);
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
