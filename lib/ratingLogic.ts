/**
 * Чиста логіка рейтингу (без prisma) — саме її перевіряють тести.
 * lib/rating.ts дістає дані з БД і передає сюди.
 *
 * Принципи (узгоджені з користувачем 2026-09-15):
 *  - бали лише за перевірений результат: складений курс, якість (100%),
 *    з першої спроби, вчасно, відзнаки; нічого за вхід/перегляд;
 *  - без штрафів — прострочення просто не дає бонусу «вчасно»;
 *  - один курс дає кожен вид балів рівно раз (@@unique у RatingEvent);
 *    пересдача, що підняла результат до 100%, доначисляє лише бонус;
 *  - період — all-time.
 */

export type RatingRuleLike = { key: string; label?: string; points: number; enabled?: boolean };
export type RatingLevelLike = { threshold: number; label: string };
export type RatingEventInput = {
  employeeId: number;
  kind: string;
  points: number;
  refType: "enrollment" | "badge";
  refId: number;
};
export type EnrollmentForRating = {
  id: number;
  employeeId: number;
  passed: boolean | null;
  scorePercent: number | null;
  completedAt: Date | string | null;
  dueDate: Date | string | null;
};
export type PointsRow = { employeeId: number; points: number };
export type CohortRow = PointsRow & { positionId: number | null };
export type PersonNode = { id: number; managerId: number | null; positionId: number | null };

export const DEFAULT_RULES: Array<Required<Pick<RatingRuleLike, "key" | "label" | "points">>> = [
  { key: "course_completed", label: "Складено курс", points: 100 },
  { key: "course_perfect", label: "Курс на 100%", points: 50 },
  { key: "first_attempt", label: "Складено з першої спроби", points: 25 },
  { key: "on_time", label: "Складено до дедлайну", points: 25 },
  { key: "manual_badge_default", label: "Ручна відзнака (за замовчуванням)", points: 50 },
];

export const DEFAULT_LEVELS: RatingLevelLike[] = [
  { threshold: 0, label: "Новачок" },
  { threshold: 300, label: "Стажер" },
  { threshold: 800, label: "Практик" },
  { threshold: 1500, label: "Профі" },
  { threshold: 2500, label: "Експерт" },
];

const rulePoints = (rules: RatingRuleLike[], key: string): number => {
  const r = rules.find((x) => x.key === key);
  return r && r.enabled !== false ? r.points : 0;
};

/**
 * Які події додати за складання курсу. existingKinds — kinds, що вже є для
 * цього enrollment (щоб не дублювати; DB @@unique — друга лінія).
 */
export function computeCourseEvents({
  enrollment,
  course,
  attemptNumber,
  existingKinds,
  rules,
}: {
  enrollment: EnrollmentForRating;
  course: { points?: number | null };
  attemptNumber: number;
  existingKinds: Set<string>;
  rules: RatingRuleLike[];
}): RatingEventInput[] {
  if (!enrollment.passed) return [];
  const ev = (kind: string, points: number): RatingEventInput[] =>
    points > 0 && !existingKinds.has(kind)
      ? [{ employeeId: enrollment.employeeId, kind, points, refType: "enrollment", refId: enrollment.id }]
      : [];
  const base = course.points ?? rulePoints(rules, "course_completed");
  const onTime = Boolean(
    enrollment.dueDate && enrollment.completedAt && new Date(enrollment.completedAt) <= new Date(enrollment.dueDate)
  );
  return [
    ...ev("course_completed", base),
    ...ev("course_perfect", enrollment.scorePercent === 100 ? rulePoints(rules, "course_perfect") : 0),
    ...ev("first_attempt", attemptNumber === 1 ? rulePoints(rules, "first_attempt") : 0),
    ...ev("on_time", onTime ? rulePoints(rules, "on_time") : 0),
  ];
}

/** Подія за відзнаку. badge.points 0 — відзнака декоративна, події нема. */
export function computeBadgeEvent(
  employeeId: number,
  badge: { id: number; points?: number | null }
): RatingEventInput | null {
  if (!badge.points || badge.points <= 0) return null;
  return { employeeId, kind: "badge", points: badge.points, refType: "badge", refId: badge.id };
}

/** Рівень за сумою балів + скільки до наступного. */
export function levelFor(points: number, levels: RatingLevelLike[] = DEFAULT_LEVELS) {
  const sorted = [...levels].sort((a, b) => a.threshold - b.threshold);
  let current = sorted[0];
  let next: RatingLevelLike | null = null;
  for (let i = 0; i < sorted.length; i += 1) {
    if (points >= sorted[i].threshold) {
      current = sorted[i];
      next = sorted[i + 1] || null;
    }
  }
  const span = next ? next.threshold - current.threshold : 0;
  const progress = next ? Math.min(1, (points - current.threshold) / span) : 1;
  return { label: current.label, threshold: current.threshold, next, progress };
}

/** Сума по видах — для блоку «за що». */
export function breakdown(events: Array<{ kind: string; points: number }>) {
  const out = { total: 0, courses: 0, bonuses: 0, badges: 0 };
  for (const e of events) {
    out.total += e.points;
    if (e.kind === "course_completed") out.courses += e.points;
    else if (e.kind === "badge") out.badges += e.points;
    else out.bonuses += e.points;
  }
  return out;
}

/** Позиція в когорті: rows уже відсортовані за спаданням балів. */
export function rankOf(rows: PointsRow[], employeeId: number) {
  const idx = rows.findIndex((r) => r.employeeId === employeeId);
  return { rank: idx === -1 ? null : idx + 1, size: rows.length };
}

/**
 * Нормування для змішаного лідерборду (керівник бачить усю гілку: ТП і SV
 * разом, а набори курсів у них різні). Оцінка = % від найкращого результату
 * в СВОЇЙ посаді по всій компанії, тож ТП з 800 балами при максимумі 1000
 * серед ТП (80%) стоїть вище за SV з 900 при максимумі 1500 серед SV (60%).
 */
export function normalizeByCohort(rows: CohortRow[], maxByPosition: Map<number, number>) {
  return rows
    .map((r) => {
      const max = r.positionId != null ? maxByPosition.get(r.positionId) || 0 : 0;
      return { ...r, normalized: max > 0 ? Math.round((r.points / max) * 100) : 0 };
    })
    .sort((a, b) => b.normalized - a.normalized || b.points - a.points);
}

/**
 * Рейтинг команди керівника з одного зрізу по всій компанії (без BFS на
 * кожного): для кожного підлеглого — бали і % від найкращого у своїй
 * посаді (normalizeByCohort), середній % команди, місце команди серед
 * команд керівників тієї ж посади (ASM з ASM, SV з SV).
 */
export function computeTeamRating(
  people: PersonNode[],
  pointsById: Map<number, number>,
  manager: { id: number; positionId: number | null }
) {
  const childrenOf = new Map<number, number[]>();
  const posById = new Map<number, number | null>();
  const maxByPosition = new Map<number, number>();
  for (const p of people) {
    posById.set(p.id, p.positionId);
    if (p.managerId != null) {
      const list = childrenOf.get(p.managerId) || [];
      list.push(p.id);
      childrenOf.set(p.managerId, list);
    }
    const pts = pointsById.get(p.id) || 0;
    if (p.positionId != null && pts > (maxByPosition.get(p.positionId) || 0)) maxByPosition.set(p.positionId, pts);
  }
  const subtree = (id: number): number[] => {
    const out: number[] = [];
    const queue = [...(childrenOf.get(id) || [])];
    while (queue.length) {
      const cur = queue.shift() as number;
      out.push(cur);
      queue.push(...(childrenOf.get(cur) || []));
    }
    return out;
  };
  const rowsFor = (id: number) =>
    normalizeByCohort(
      subtree(id).map((pid) => ({ employeeId: pid, points: pointsById.get(pid) || 0, positionId: posById.get(pid) ?? null })),
      maxByPosition
    );
  const avgOf = (rows: Array<{ normalized: number }>) =>
    rows.length ? Math.round(rows.reduce((s, r) => s + r.normalized, 0) / rows.length) : 0;

  const rows = rowsFor(manager.id);
  const teams = people
    .filter((p) => p.positionId != null && p.positionId === manager.positionId && childrenOf.has(p.id))
    .map((p) => ({ id: p.id, avg: avgOf(rowsFor(p.id)) }))
    .sort((a, b) => b.avg - a.avg);
  const idx = teams.findIndex((t) => t.id === manager.id);
  const byEmployeeId: Record<number, { points: number; normalized: number }> = {};
  for (const r of rows) byEmployeeId[r.employeeId] = { points: r.points, normalized: r.normalized };
  return { byEmployeeId, avg: avgOf(rows), rank: idx === -1 ? null : idx + 1, teams: teams.length };
}

/** Обов'язкові курси — блок на головній замість «Прогрес адаптації». */
export function mandatoryProgress(
  enrollments: Array<{ isMandatory: boolean; status: string; dueDate: Date | string | null }>,
  now: Date = new Date()
) {
  const mandatory = enrollments.filter((e) => e.isMandatory);
  const completed = mandatory.filter((e) => e.status === "completed").length;
  const overdue = mandatory.filter((e) => e.status !== "completed" && e.dueDate && new Date(e.dueDate) < now).length;
  const upcoming = mandatory
    .filter((e) => e.status !== "completed" && e.dueDate && new Date(e.dueDate) >= now)
    .map((e) => new Date(e.dueDate as Date | string))
    .sort((a, b) => a.getTime() - b.getTime());
  return { total: mandatory.length, completed, overdue, nextDue: upcoming[0] || null };
}
