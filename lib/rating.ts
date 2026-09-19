import type { PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { getAllSubordinates } from "@/lib/permissions";
import {
  DEFAULT_RULES,
  DEFAULT_LEVELS,
  computeCourseEvents,
  computeBadgeEvent,
  computeTeamRating,
  levelFor,
  breakdown,
  rankOf,
  normalizeByCohort,
  type RatingEventInput,
} from "@/lib/ratingLogic";

/**
 * Рейтинг співробітника — журнал RatingEvent + правила/рівні з БД.
 * Уся арифметика — lib/ratingLogic.ts; тут лише читання/запис.
 *
 * Хуки: app/api/courses/[slug]/submit (складання курсу) і видача відзнак
 * (lib/badgeRules.js, app/api/admin/employees/[id]/badges) → record*().
 * Усе best-effort у try/catch на боці викликача — бали не мають ламати
 * бізнес-дію.
 */

// lib/prisma.js віддає `any` (синглтон через globalThis) — тут звужуємо до
// реального клієнта, щоб запити нижче перевірялись типами.
const prisma = prismaUntyped as PrismaClient;

/** Мінімум, що потрібен від Employee (getCurrentUser віддає більше). */
export type RatedEmployee = {
  id: number;
  positionId: number | null;
  position?: { level?: number | null } | null;
};

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

type StoredEvent = { id: number; employeeId: number; kind: string; points: number; refType: string; refId: number };

const eventKey = (e: { employeeId: number; kind: string; refType: string; refId: number }) =>
  `${e.employeeId}:${e.kind}:${e.refType}:${e.refId}` as const;

/**
 * Приводить ЧАСТИНУ журналу (вже вибрані `existing` — усе, що стосується
 * одного enrollment чи однієї відзнаки) до бажаного стану `wanted`: чого
 * бракує — створює, що змінилось у ціні — оновлює, чого більше не
 * заслужено — видаляє.
 *
 * Це і є «перерахунок» замість колишнього «дописати, чого нема»: до
 * 2026-09-19 журнал лише ріс, тож скинутий адміном курс лишав по собі
 * бали (у SV0036 так висіло 200 балів за курс у статусі not_started), а
 * правка ціни відзнаки в /admin/badges не доходила до тих, кому її вже
 * видано (там же «Кращій СВ» коштувала 1000, а в журналі лежало 100).
 */
async function syncEvents(existing: StoredEvent[], wanted: RatingEventInput[]) {
  const wantedByKey = new Map(wanted.map((w) => [eventKey(w), w]));
  const existingByKey = new Map(existing.map((e) => [eventKey(e), e]));
  const staleIds = existing.filter((e) => !wantedByKey.has(eventKey(e))).map((e) => e.id);
  const toCreate = wanted.filter((w) => !existingByKey.has(eventKey(w)));
  const toUpdate = wanted
    .map((w) => ({ w, cur: existingByKey.get(eventKey(w)) }))
    .filter((p): p is { w: RatingEventInput; cur: StoredEvent } => Boolean(p.cur) && p.cur!.points !== p.w.points);

  const ops = [
    ...(staleIds.length ? [prisma.ratingEvent.deleteMany({ where: { id: { in: staleIds } } })] : []),
    ...toUpdate.map(({ w, cur }) => prisma.ratingEvent.update({ where: { id: cur.id }, data: { points: w.points } })),
    ...(toCreate.length ? [prisma.ratingEvent.createMany({ data: toCreate, skipDuplicates: true })] : []),
  ];
  if (ops.length > 0) await prisma.$transaction(ops);
  return { created: toCreate.length, updated: toUpdate.length, removed: staleIds.length };
}

/**
 * Синхронізує бали за ОДИН enrollment із його поточним станом. Викликати
 * після будь-якої зміни результату: складання курсу
 * (app/api/courses/[slug]/submit) і ручної корекції адміном
 * (app/api/admin/enrollments/[enrollmentId]) — не лише коли курс щойно
 * склали.
 */
export async function syncEnrollmentEvents(enrollmentId: number) {
  const [enrollment, existing, rules] = await Promise.all([
    prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: { select: { points: true } }, _count: { select: { attempts: true } } },
    }),
    prisma.ratingEvent.findMany({ where: { refType: "enrollment", refId: enrollmentId } }),
    getRules(),
  ]);
  const wanted = enrollment
    ? computeCourseEvents({
        enrollment,
        course: enrollment.course,
        attemptNumber: enrollment._count.attempts,
        existingKinds: new Set(),
        rules,
      })
    : [];
  return syncEvents(existing, wanted);
}

/** Видано відзнаку — бали за відзнаку (0 = декоративна). */
export async function recordBadgeAward(employeeId: number, badge: { id: number; points?: number | null; kind?: string | null }) {
  const event = computeBadgeEvent(employeeId, badge, await getRules());
  if (!event) return { created: 0 };
  const r = await prisma.ratingEvent.createMany({ data: [event], skipDuplicates: true });
  return { created: r.count, points: event.points };
}

/**
 * Синхронізує бали ВСІХ, кому видано цю відзнаку, з її поточною ціною —
 * після правки Badge.points у /admin/badges. Ціна відзнаки тут «жива», а
 * не знімок на момент видачі (рішення користувача 2026-09-19): інакше на
 * екрані «Досягнення» плашка відзнаки і сума балів показують різні числа
 * про одне й те саме.
 */
export async function syncBadgeAwards(badgeId: number) {
  const [badge, awards, existing, rules] = await Promise.all([
    prisma.badge.findUnique({ where: { id: badgeId }, select: { id: true, points: true, kind: true } }),
    prisma.employeeBadge.findMany({ where: { badgeId }, select: { employeeId: true } }),
    prisma.ratingEvent.findMany({ where: { refType: "badge", refId: badgeId } }),
    getRules(),
  ]);
  const wanted = badge
    ? awards.flatMap((a) => {
        const ev = computeBadgeEvent(a.employeeId, badge, rules);
        return ev ? [ev] : [];
      })
    : [];
  return syncEvents(existing, wanted);
}

/** Сума балів по списку людей: [{employeeId, points}] за спаданням. */
async function sumPoints(employeeIds: number[]) {
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
async function cohortIds(employee: RatedEmployee) {
  if (!employee.positionId) return [];
  const rows = await prisma.employee.findMany({ where: { positionId: employee.positionId, isActive: true }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Картка рейтингу людини: бали, «за що», рівень, місце в когорті. */
export async function getEmployeeRating(employee: RatedEmployee) {
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

export type LeaderboardScope = "position" | "level" | "region";

/**
 * Лідери. scope:
 *  - "position" — та сама посада (для хаба);
 *  - "level"    — усі посади того самого рівня ієрархії (Position.level);
 *  - "region"   — уся гілка підпорядкування керівника (для RM/кабінету).
 */
export async function getLeaderboard(employee: RatedEmployee, scope: LeaderboardScope = "position", limit = 5) {
  let ids: number[];
  if (scope === "region") {
    ids = await getAllSubordinates(employee.id);
  } else {
    const where: { isActive: boolean; position?: { level: number }; positionId?: number } = { isActive: true };
    if (scope === "level" && employee.position?.level != null) where.position = { level: employee.position.level };
    else if (employee.positionId) where.positionId = employee.positionId;
    else return [];
    ids = (await prisma.employee.findMany({ where, select: { id: true } })).map((e) => e.id);
  }
  let rows: Array<{ employeeId: number; points: number; normalized?: number }> = (await sumPoints(ids)).filter(
    (r) => r.points > 0
  );
  if (rows.length === 0) return [];

  // Змішана гілка (region): ТП і SV в одному списку — нормуємо як % від
  // найкращого в СВОЇЙ посаді по всій компанії (lib/ratingLogic.ts
  // normalizeByCohort), інакше порівнюються різні набори курсів.
  if (scope === "region") {
    const people = await prisma.employee.findMany({
      where: { id: { in: rows.map((r) => r.employeeId) } },
      select: { id: true, positionId: true },
    });
    const posById = new Map(people.map((p) => [p.id, p.positionId]));
    const positionIds = people.map((p) => p.positionId).filter((p): p is number => p != null);
    const cohortPeople = await prisma.employee.findMany({
      where: { positionId: { in: [...new Set(positionIds)] }, isActive: true },
      select: { id: true, positionId: true },
    });
    const cohortSums = await sumPoints(cohortPeople.map((p) => p.id));
    const cohortPos = new Map(cohortPeople.map((p) => [p.id, p.positionId]));
    const maxByPosition = new Map<number, number>();
    for (const s of cohortSums) {
      const pos = cohortPos.get(s.employeeId);
      if (pos != null && s.points > (maxByPosition.get(pos) || 0)) maxByPosition.set(pos, s.points);
    }
    rows = normalizeByCohort(
      rows.map((r) => ({ employeeId: r.employeeId, points: r.points, positionId: posById.get(r.employeeId) ?? null })),
      maxByPosition
    );
  }

  const top = rows.slice(0, limit);
  const names = await prisma.employee.findMany({
    where: { id: { in: top.map((t) => t.employeeId) } },
    select: { id: true, name: true, avatarUrl: true, position: { select: { name: true } } },
  });
  const byId = new Map(names.map((n) => [n.id, n]));
  return top.map((t) => ({
    id: t.employeeId,
    name: byId.get(t.employeeId)?.name || "—",
    avatarUrl: byId.get(t.employeeId)?.avatarUrl ?? null,
    position: byId.get(t.employeeId)?.position?.name || "",
    points: t.points,
    normalized: t.normalized ?? null,
  }));
}

/**
 * Рейтинг команди для кабінету керівника (/api/manager/overview): бали й %
 * по кожному підлеглому + середнє команди і місце серед команд тієї ж
 * посади. Два запити на всю компанію замість BFS на кожного керівника.
 */
export async function getTeamRating(manager: RatedEmployee) {
  const [people, sums] = await Promise.all([
    prisma.employee.findMany({ where: { isActive: true }, select: { id: true, managerId: true, positionId: true } }),
    prisma.ratingEvent.groupBy({ by: ["employeeId"], _sum: { points: true } }),
  ]);
  return computeTeamRating(people, new Map(sums.map((s) => [s.employeeId, s._sum.points || 0])), manager);
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
    prisma.employeeBadge.findMany({ include: { badge: { select: { id: true, points: true, kind: true } } } }),
  ]);
  const events: RatingEventInput[] = [];
  for (const e of enrollments) {
    events.push(
      // Кількість спроб — як є, БЕЗ Math.max(1, …): курс без жодної
      // записаної спроби (ручна корекція адміна «зарахував офлайн») не має
      // отримувати бонус «з першої спроби» — доказу першої спроби просто
      // нема. Те саме число, що й у живому syncEnrollmentEvents, інакше
      // «Перерахувати все» міняло б бали там, де нічого не змінилось.
      ...computeCourseEvents({
        enrollment: e,
        course: e.course,
        attemptNumber: e._count.attempts,
        existingKinds: new Set(),
        rules,
      })
    );
  }
  for (const a of awards) {
    const ev = computeBadgeEvent(a.employeeId, a.badge, rules);
    if (ev) events.push(ev);
  }
  const [, created] = await prisma.$transaction([
    prisma.ratingEvent.deleteMany({}),
    prisma.ratingEvent.createMany({ data: events, skipDuplicates: true }),
  ]);
  return { enrollments: enrollments.length, badges: awards.length, events: created.count };
}
