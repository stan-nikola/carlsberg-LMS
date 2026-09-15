/**
 * Чиста логіка рейтингу (без prisma) — саме її перевіряють тести.
 * lib/rating.js дістає дані з БД і передає сюди.
 *
 * Принципи (узгоджені з користувачем 2026-09-15):
 *  - бали лише за перевірений результат: складений курс, якість (100%),
 *    з першої спроби, вчасно, відзнаки; нічого за вхід/перегляд;
 *  - без штрафів — прострочення просто не дає бонусу «вчасно»;
 *  - один курс дає кожен вид балів рівно раз (@@unique у RatingEvent);
 *    пересдача, що підняла результат до 100%, доначисляє лише бонус;
 *  - період — all-time.
 */

export const DEFAULT_RULES = [
  { key: "course_completed", label: "Складено курс", points: 100 },
  { key: "course_perfect", label: "Курс на 100%", points: 50 },
  { key: "first_attempt", label: "Складено з першої спроби", points: 25 },
  { key: "on_time", label: "Складено до дедлайну", points: 25 },
  { key: "manual_badge_default", label: "Ручна відзнака (за замовчуванням)", points: 50 },
];

export const DEFAULT_LEVELS = [
  { threshold: 0, label: "Новачок" },
  { threshold: 300, label: "Стажер" },
  { threshold: 800, label: "Практик" },
  { threshold: 1500, label: "Профі" },
  { threshold: 2500, label: "Експерт" },
];

const rulePoints = (rules, key) => {
  const r = rules.find((x) => x.key === key);
  return r && r.enabled !== false ? r.points : 0;
};

/**
 * Які події додати за складання курсу. existing — kinds, що вже є для
 * цього enrollment (щоб не дублювати; DB @@unique — друга лінія).
 *
 * @param {{enrollment:{id:number, employeeId:number, passed:boolean, scorePercent:number|null, completedAt:Date|null, dueDate:Date|null}, course:{points:number|null}, attemptNumber:number, existingKinds:Set<string>, rules:Array}} input
 * @returns {Array<{employeeId:number, kind:string, points:number, refType:"enrollment", refId:number}>}
 */
export function computeCourseEvents({ enrollment, course, attemptNumber, existingKinds, rules }) {
  if (!enrollment.passed) return [];
  const ev = (kind, points) =>
    points > 0 && !existingKinds.has(kind)
      ? [{ employeeId: enrollment.employeeId, kind, points, refType: "enrollment", refId: enrollment.id }]
      : [];
  const base = course.points ?? rulePoints(rules, "course_completed");
  const onTime =
    enrollment.dueDate && enrollment.completedAt && new Date(enrollment.completedAt) <= new Date(enrollment.dueDate);
  return [
    ...ev("course_completed", base),
    ...ev("course_perfect", enrollment.scorePercent === 100 ? rulePoints(rules, "course_perfect") : 0),
    ...ev("first_attempt", attemptNumber === 1 ? rulePoints(rules, "first_attempt") : 0),
    ...ev("on_time", onTime ? rulePoints(rules, "on_time") : 0),
  ];
}

/** Подія за відзнаку. badge.points 0 — відзнака декоративна, події нема. */
export function computeBadgeEvent(employeeId, badge) {
  if (!badge.points || badge.points <= 0) return null;
  return { employeeId, kind: "badge", points: badge.points, refType: "badge", refId: badge.id };
}

/** Рівень за сумою балів + скільки до наступного. */
export function levelFor(points, levels = DEFAULT_LEVELS) {
  const sorted = [...levels].sort((a, b) => a.threshold - b.threshold);
  let current = sorted[0];
  let next = null;
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
export function breakdown(events) {
  const out = { total: 0, courses: 0, bonuses: 0, badges: 0 };
  for (const e of events) {
    out.total += e.points;
    if (e.kind === "course_completed") out.courses += e.points;
    else if (e.kind === "badge") out.badges += e.points;
    else out.bonuses += e.points;
  }
  return out;
}

/** Позиція в когорті: [{employeeId, points}] уже відсортовані за спаданням. */
export function rankOf(rows, employeeId) {
  const idx = rows.findIndex((r) => r.employeeId === employeeId);
  return { rank: idx === -1 ? null : idx + 1, size: rows.length };
}

/**
 * Нормування для змішаного лідерборду (керівник бачить усю гілку: ТП і SV
 * разом, а набори курсів у них різні). Оцінка = % від найкращого результату
 * в СВОЇЙ посаді по всій компанії, тож ТП з 800 балами при максимумі 1000
 * серед ТП (80%) стоїть вище за SV з 900 при максимумі 1500 серед SV (60%).
 *
 * @param {Array<{employeeId:number, points:number, positionId:number|null}>} rows
 * @param {Map<number, number>} maxByPosition positionId → найбільша сума в посаді
 */
export function normalizeByCohort(rows, maxByPosition) {
  return rows
    .map((r) => {
      const max = r.positionId != null ? maxByPosition.get(r.positionId) || 0 : 0;
      return { ...r, normalized: max > 0 ? Math.round((r.points / max) * 100) : 0 };
    })
    .sort((a, b) => b.normalized - a.normalized || b.points - a.points);
}

/** Обов'язкові курси — блок на головній замість «Прогрес адаптації». */
export function mandatoryProgress(enrollments, now = new Date()) {
  const mandatory = enrollments.filter((e) => e.isMandatory);
  const completed = mandatory.filter((e) => e.status === "completed").length;
  const overdue = mandatory.filter((e) => e.status !== "completed" && e.dueDate && new Date(e.dueDate) < now).length;
  const nextDue = mandatory
    .filter((e) => e.status !== "completed" && e.dueDate && new Date(e.dueDate) >= now)
    .map((e) => new Date(e.dueDate))
    .sort((a, b) => a - b)[0] || null;
  return { total: mandatory.length, completed, overdue, nextDue };
}

/**
 * Рейтинг команди керівника з одного зрізу по всій компанії (без BFS на
 * кожного): для кожного підлеглого — бали і % від найкращого у своїй
 * посаді (normalizeByCohort), середній % команди, місце команди серед
 * команд керівників тієї ж посади (ASM з ASM, SV з SV).
 *
 * @param {Array<{id:number, managerId:number|null, positionId:number|null}>} people активні
 * @param {Map<number, number>} pointsById
 * @param {{id:number, positionId:number|null}} manager
 */
export function computeTeamRating(people, pointsById, manager) {
  const childrenOf = new Map();
  const posById = new Map();
  const maxByPosition = new Map();
  for (const p of people) {
    posById.set(p.id, p.positionId);
    if (p.managerId != null) {
      if (!childrenOf.has(p.managerId)) childrenOf.set(p.managerId, []);
      childrenOf.get(p.managerId).push(p.id);
    }
    const pts = pointsById.get(p.id) || 0;
    if (p.positionId != null && pts > (maxByPosition.get(p.positionId) || 0)) maxByPosition.set(p.positionId, pts);
  }
  const subtree = (id) => {
    const out = [];
    const queue = [...(childrenOf.get(id) || [])];
    while (queue.length) {
      const cur = queue.shift();
      out.push(cur);
      queue.push(...(childrenOf.get(cur) || []));
    }
    return out;
  };
  const rowsFor = (id) =>
    normalizeByCohort(
      subtree(id).map((pid) => ({ employeeId: pid, points: pointsById.get(pid) || 0, positionId: posById.get(pid) ?? null })),
      maxByPosition
    );
  const avgOf = (rows) => (rows.length ? Math.round(rows.reduce((s, r) => s + r.normalized, 0) / rows.length) : 0);

  const rows = rowsFor(manager.id);
  const teams = people
    .filter((p) => p.positionId != null && p.positionId === manager.positionId && childrenOf.has(p.id))
    .map((p) => ({ id: p.id, avg: avgOf(rowsFor(p.id)) }))
    .sort((a, b) => b.avg - a.avg);
  const idx = teams.findIndex((t) => t.id === manager.id);
  return {
    byEmployeeId: Object.fromEntries(rows.map((r) => [r.employeeId, { points: r.points, normalized: r.normalized }])),
    avg: avgOf(rows),
    rank: idx === -1 ? null : idx + 1,
    teams: teams.length,
  };
}
