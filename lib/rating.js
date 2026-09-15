import { prisma } from "@/lib/prisma";
import { getAllSubordinates } from "@/lib/permissions";
import {
  DEFAULT_RULES,
  DEFAULT_LEVELS,
  computeCourseEvents,
  computeBadgeEvent,
  levelFor,
  breakdown,
  rankOf,
  normalizeByCohort,
  computeTeamRating,
} from "@/lib/ratingLogic";

/**
 * Рейтинг співробітника — журнал RatingEvent + правила/рівні з БД.
 * Уся арифметика — lib/ratingLogic.js; тут лише читання/запис.
 *
 * Хуки: app/api/courses/[slug]/submit (складання курсу) і видача відзнак
 * (lib/badgeRules.js, app/api/admin/employees/[id]/badges) → record*().
 * Усе best-effort у try/catch на боці викликача — бали не мають ламати
 * бізнес-дію.
 */

export async function getRules() {
  let rules = await prisma.ratingRule.findMany();
  if (rules.length === 0) {
    await prisma.ratingRule.createMany({ data: DEFAULT_RULES, skipDuplicates: true });
    rules = await prisma.ratingRule.findMany();
  }
  // Нові ключі, що з'явились у коді після сідування — додаємо тихо.
  const missing = DEFAULT_RULES.filter((d) => !rules.some((r) => r.key === d.key));
  if (missing.length > 0) {
    await prisma.ratingRule.createMany({ data: missing, skipDuplicates: true });
    rules = await prisma.ratingRule.findMany();
  }
  return rules;
}

export async function getLevels() {
  let levels = await prisma.ratingLevel.findMany({ orderBy: { threshold: "asc" } });
  if (levels.length === 0) {
    await prisma.ratingLevel.createMany({ data: DEFAULT_LEVELS, skipDuplicates: true });
    levels = await prisma.ratingLevel.findMany({ orderBy: { threshold: "asc" } });
  }
  return levels;
}

/** Складено курс — нарахувати те, чого ще нема для цього enrollment. */
export async function recordCourseCompletion(enrollmentId) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { course: { select: { points: true, title: true } }, _count: { select: { attempts: true } } },
  });
  if (!enrollment) return { created: 0 };
  const [rules, existing] = await Promise.all([
    getRules(),
    prisma.ratingEvent.findMany({ where: { employeeId: enrollment.employeeId, refType: "enrollment", refId: enrollmentId }, select: { kind: true } }),
  ]);
  const events = computeCourseEvents({
    enrollment,
    course: enrollment.course,
    attemptNumber: enrollment._count.attempts,
    existingKinds: new Set(existing.map((e) => e.kind)),
    rules,
  });
  if (events.length === 0) return { created: 0 };
  const r = await prisma.ratingEvent.createMany({ data: events, skipDuplicates: true });
  return { created: r.count, points: events.reduce((s, e) => s + e.points, 0) };
}

/** Видано відзнаку — бали за Badge.points (0 = декоративна). */
export async function recordBadgeAward(employeeId, badge) {
  const event = computeBadgeEvent(employeeId, badge);
  if (!event) return { created: 0 };
  const r = await prisma.ratingEvent.createMany({ data: [event], skipDuplicates: true });
  return { created: r.count, points: event.points };
}

/** Сума балів по списку людей: [{employeeId, points}] за спаданням. */
async function sumPoints(employeeIds) {
  if (employeeIds.length === 0) return [];
  const rows = await prisma.ratingEvent.groupBy({
    by: ["employeeId"],
    where: { employeeId: { in: employeeIds } },
    _sum: { points: true },
  });
  const byId = new Map(rows.map((r) => [r.employeeId, r._sum.points || 0]));
  return employeeIds
    .map((id) => ({ employeeId: id, points: byId.get(id) || 0 }))
    .sort((a, b) => b.points - a.points);
}

/**
 * Когорта для «№ N з M» — усі активні на тій самій посаді (ТП з ТП, не
 * ТП з RM: різний набір обов'язкових курсів). Без посади — когорти нема.
 */
async function cohortIds(employee) {
  if (!employee.positionId) return [];
  const rows = await prisma.employee.findMany({ where: { positionId: employee.positionId, isActive: true }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Картка рейтингу людини: бали, «за що», рівень, місце в когорті. */
export async function getEmployeeRating(employee) {
  const [events, levels, cohort, badgesCount] = await Promise.all([
    prisma.ratingEvent.findMany({ where: { employeeId: employee.id }, select: { kind: true, points: true } }),
    getLevels(),
    cohortIds(employee),
    prisma.employeeBadge.count({ where: { employeeId: employee.id } }),
  ]);
  const sums = breakdown(events);
  const level = levelFor(sums.total, levels);
  const rows = await sumPoints(cohort);
  return { ...sums, badgesCount, level, ...rankOf(rows, employee.id) };
}

/**
 * Лідери. scope:
 *  - "position" — та сама посада (для хаба);
 *  - "level"    — усі посади того самого рівня ієрархії (Position.level);
 *  - "region"   — уся гілка підпорядкування керівника (для RM/кабінету).
 */
export async function getLeaderboard(employee, scope = "position", limit = 5) {
  let ids;
  if (scope === "region") {
    ids = await getAllSubordinates(employee.id);
  } else {
    const where = { isActive: true };
    if (scope === "level" && employee.position?.level != null) where.position = { level: employee.position.level };
    else if (employee.positionId) where.positionId = employee.positionId;
    else return [];
    ids = (await prisma.employee.findMany({ where, select: { id: true } })).map((e) => e.id);
  }
  let rows = (await sumPoints(ids)).filter((r) => r.points > 0);
  if (rows.length === 0) return [];

  // Змішана гілка (region): ТП і SV в одному списку — нормуємо як % від
  // найкращого в СВОЇЙ посаді по всій компанії (lib/ratingLogic.js
  // normalizeByCohort), інакше порівнюються різні набори курсів.
  if (scope === "region") {
    const people = await prisma.employee.findMany({ where: { id: { in: rows.map((r) => r.employeeId) } }, select: { id: true, positionId: true } });
    const posById = new Map(people.map((p) => [p.id, p.positionId]));
    const positionIds = [...new Set(people.map((p) => p.positionId).filter((p) => p != null))];
    const cohortPeople = await prisma.employee.findMany({ where: { positionId: { in: positionIds }, isActive: true }, select: { id: true, positionId: true } });
    const cohortSums = await sumPoints(cohortPeople.map((p) => p.id));
    const cohortPos = new Map(cohortPeople.map((p) => [p.id, p.positionId]));
    const maxByPosition = new Map();
    for (const s of cohortSums) {
      const pos = cohortPos.get(s.employeeId);
      if (s.points > (maxByPosition.get(pos) || 0)) maxByPosition.set(pos, s.points);
    }
    rows = normalizeByCohort(rows.map((r) => ({ ...r, positionId: posById.get(r.employeeId) ?? null })), maxByPosition);
  }

  const top = rows.slice(0, limit);
  const names = await prisma.employee.findMany({
    where: { id: { in: top.map((t) => t.employeeId) } },
    select: { id: true, name: true, position: { select: { name: true } } },
  });
  const byId = new Map(names.map((n) => [n.id, n]));
  return top.map((t) => ({
    id: t.employeeId,
    name: byId.get(t.employeeId)?.name || "—",
    position: byId.get(t.employeeId)?.position?.name || "",
    points: t.points,
    normalized: t.normalized ?? null,
  }));
}

/**
 * Повний перерахунок з нуля за ПОТОЧНИМИ правилами — явна дія адміна
 * (/admin/rating «Перерахувати все»). Журнал стирається і будується
 * заново з Enrollment/EnrollmentAttempt/EmployeeBadge.
 * ponytail: по одному enrollment, ~N запитів; ок для тисяч рядків раз на
 * зміну правил — батчити, якщо стане повільно.
 */
export async function recalculateAll() {
  const rules = await getRules();
  const [enrollments, awards] = await Promise.all([
    prisma.enrollment.findMany({
      where: { status: "completed", passed: true },
      include: { course: { select: { points: true } }, _count: { select: { attempts: true } } },
    }),
    prisma.employeeBadge.findMany({ include: { badge: { select: { id: true, points: true } } } }),
  ]);
  const events = [];
  for (const e of enrollments) {
    events.push(...computeCourseEvents({ enrollment: e, course: e.course, attemptNumber: Math.max(1, e._count.attempts), existingKinds: new Set(), rules }));
  }
  for (const a of awards) {
    const ev = computeBadgeEvent(a.employeeId, a.badge);
    if (ev) events.push(ev);
  }
  const [, created] = await prisma.$transaction([
    prisma.ratingEvent.deleteMany({}),
    prisma.ratingEvent.createMany({ data: events, skipDuplicates: true }),
  ]);
  return { enrollments: enrollments.length, badges: awards.length, events: created.count };
}

/**
 * Рейтинг команди для кабінету керівника (/api/manager/overview): бали й %
 * по кожному підлеглому + середнє команди і місце серед команд тієї ж
 * посади. Два запити на всю компанію замість BFS на кожного керівника.
 */
export async function getTeamRating(manager) {
  const [people, sums] = await Promise.all([
    prisma.employee.findMany({ where: { isActive: true }, select: { id: true, managerId: true, positionId: true } }),
    prisma.ratingEvent.groupBy({ by: ["employeeId"], _sum: { points: true } }),
  ]);
  return computeTeamRating(people, new Map(sums.map((s) => [s.employeeId, s._sum.points || 0])), manager);
}
