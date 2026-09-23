/**
 * Drill-down дашборд керівника (/manager, /manager/team) — чиста логіка
 * поверх сирих даних lib/teamEnrollments.ts. Одне джерело правди для
 * полоси статусів, списку «Потребують уваги», матриці люди × курси,
 * воронок по курсах і фільтрів сторінки списку: кожна цифра на дашборді
 * — це `applyTeamFilters` з тим самим набором параметрів, що й у href
 * під нею, тому «клікнув 8 → побачив 8».
 *
 * «Відстає» — рівно `buildCoursePlan().schedule.status === "behind"`
 * (рішення користувача 2026-09-23): керівник бачить те саме, що людина в
 * плеєрі; курси без графіка модулів (Course.moduleDays) відстаючими не
 * бувають — лише «за графіком / прострочено» за дедлайном.
 */

import { buildCoursePlan, formatDate, toPacing, toPlanInputs, type ScheduleStatus } from "./coursePlan";
import { formatRelativeTime } from "./notificationTypes";
import type { RawAttempt, RawEmployee, TeamRaw } from "./teamEnrollments";

export const INACTIVE_DAYS = 14;
export const ATTENTION_LIMIT = 5;
export const MATRIX_ROW_CAP = 15;
export const TREND_WEEKS = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

export type PersonSegment = "overdue" | "behind" | "not_started" | "inactive" | "on_track";
export type CellStatus = "passed" | "failed" | "overdue" | "behind" | "in_progress" | "not_started";

export type TeamRow = {
  enrollmentId: number;
  employeeId: number;
  employeeName: string;
  courseId: number;
  courseSlug: string;
  courseTitle: string;
  isMandatory: boolean;
  status: string;
  passed: boolean | null;
  scorePercent: number | null;
  assignedAt: string;
  dueDate: string | null;
  dueDateLabel: string | null;
  completedAt: string | null;
  completedAtLabel: string | null;
  isOverdue: boolean;
  /** Завершив після дедлайну або прострочив — доповнення до «Вчасно». */
  isLate: boolean;
  schedule: ScheduleStatus | null;
  failedModuleIds: number[];
  modulesPassed: number;
  modulesTotal: number;
  cell: CellStatus;
};

export type PersonCounts = {
  total: number;
  completed: number;
  overdue: number;
  inProgress: number;
  notStarted: number;
  failed: number;
  behind: number;
  avgScore: number | null;
};

export type TeamPerson = {
  id: number;
  name: string;
  avatarUrl: string | null;
  positionCode: string | null;
  positionName: string | null;
  positionLevel: number | null;
  managerId: number | null;
  lastSeenAt: string | null;
  lastSeenLabel: string;
  inactive: boolean;
  /** null — призначень немає взагалі (у полосу статусів не входить). */
  segment: PersonSegment | null;
  counts: PersonCounts;
  urgency: number;
  /** Індекси тижнів (0 = цей тиждень), коли людина складала модулі. */
  activeWeeks: number[];
};

export const SEGMENT_META: Record<PersonSegment, { label: string }> = {
  overdue: { label: "Прострочено" },
  behind: { label: "Відстають" },
  not_started: { label: "Не почали" },
  inactive: { label: "Неактивні" },
  on_track: { label: "За графіком" },
};

/** 1 курс / 2 курси / 5 курсів. */
export function pluralCourses(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "курс";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "курси";
  return "курсів";
}

/** 1 людина / 2 людини / 5 людей. */
export function pluralPeople(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "людина";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "людини";
  return "людей";
}

/**
 * Підпис причини в списку «Потребують уваги». ОДИНИЦЯ ЗАВЖДИ НАЗВАНА:
 * «не почав» без уточнення читалось як «людина не почала нічого», хоча
 * означало «один її курс ще не розпочато» — і суперечило кільцю
 * «Розпочали 100%» поруч (скарга користувача, 2026-09-23).
 */
export function reasonLabel(kind: PersonSegment, count: number): string {
  if (kind === "overdue") return `${count} ${pluralCourses(count)} прострочено`;
  if (kind === "behind") return `відстає: ${count} ${pluralCourses(count)}`;
  if (kind === "not_started") return `${count} ${pluralCourses(count)} не розпочато`;
  if (kind === "inactive") return "неактивний";
  return "за графіком";
}

export const SEGMENT_ORDER: PersonSegment[] = ["overdue", "behind", "not_started", "inactive", "on_track"];

function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

function label(d: Date | null | undefined): string | null {
  return d ? formatDate(new Date(d)) : null;
}

export function buildTeamRows(raw: TeamRaw, now: Date): TeamRow[] {
  const courseById = new Map(raw.courses.map((c) => [c.id, c]));
  const employeeById = new Map(raw.employees.map((e) => [e.id, e]));
  const completionsByEnrollment = new Map<number, TeamRaw["completions"]>();
  for (const c of raw.completions) {
    const list = completionsByEnrollment.get(c.enrollmentId) || [];
    list.push(c);
    completionsByEnrollment.set(c.enrollmentId, list);
  }

  const rows: TeamRow[] = [];
  for (const e of raw.enrollments) {
    const course = courseById.get(e.courseId);
    const employee = employeeById.get(e.employeeId);
    if (!course || !employee) continue;
    const completions = completionsByEnrollment.get(e.id) || [];
    const plan = buildCoursePlan(
      toPlanInputs(course.modules),
      completions,
      { assignedAt: e.assignedAt, dueDate: e.dueDate },
      now,
      toPacing(course)
    );
    const completed = e.status === "completed";
    const isOverdue = !completed && (e.status === "overdue" || (e.dueDate != null && new Date(e.dueDate).getTime() < now.getTime()));
    const isLate = isOverdue || (completed && e.dueDate != null && e.completedAt != null && new Date(e.completedAt) > new Date(e.dueDate));
    const schedule = completed ? null : (plan.schedule?.status ?? null);
    const failedModuleIds = completions.filter((c) => c.passed === false).map((c) => c.moduleId);

    let cell: CellStatus;
    if (completed) cell = e.passed === false ? "failed" : "passed";
    else if (isOverdue) cell = "overdue";
    else if (schedule === "behind") cell = "behind";
    else if (e.status === "in_progress" || completions.length > 0) cell = "in_progress";
    else cell = "not_started";

    rows.push({
      enrollmentId: e.id,
      employeeId: e.employeeId,
      employeeName: employee.name,
      courseId: course.id,
      courseSlug: course.slug,
      courseTitle: course.title,
      isMandatory: course.isMandatory,
      status: e.status,
      passed: e.passed,
      scorePercent: e.scorePercent,
      assignedAt: new Date(e.assignedAt).toISOString(),
      dueDate: iso(e.dueDate),
      dueDateLabel: label(e.dueDate),
      completedAt: iso(e.completedAt),
      completedAtLabel: label(e.completedAt),
      isOverdue,
      isLate,
      schedule,
      failedModuleIds,
      modulesPassed: plan.passedCount,
      modulesTotal: plan.modules.length,
      cell,
    });
  }
  return rows;
}

function weekIndex(date: Date, now: Date): number {
  const daysAgo = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  return Math.floor(daysAgo / 7);
}

export function buildPeople(rows: TeamRow[], raw: TeamRaw, now: Date): TeamPerson[] {
  const rowsByEmployee = new Map<number, TeamRow[]>();
  for (const r of rows) {
    const list = rowsByEmployee.get(r.employeeId) || [];
    list.push(r);
    rowsByEmployee.set(r.employeeId, list);
  }
  const enrollmentEmployee = new Map(raw.enrollments.map((e) => [e.id, e.employeeId]));
  const weeksByEmployee = new Map<number, Set<number>>();
  for (const c of raw.completions) {
    const employeeId = enrollmentEmployee.get(c.enrollmentId);
    if (employeeId == null) continue;
    const w = weekIndex(new Date(c.completedAt), now);
    if (w < 0 || w >= TREND_WEEKS) continue;
    const set = weeksByEmployee.get(employeeId) || new Set<number>();
    set.add(w);
    weeksByEmployee.set(employeeId, set);
  }

  return raw.employees.map((e) => personFrom(e, rowsByEmployee.get(e.id) || [], weeksByEmployee.get(e.id), now));
}

function personFrom(e: RawEmployee, rows: TeamRow[], weeks: Set<number> | undefined, now: Date): TeamPerson {
  const counts: PersonCounts = { total: 0, completed: 0, overdue: 0, inProgress: 0, notStarted: 0, failed: 0, behind: 0, avgScore: null };
  let scoreSum = 0;
  let scoreCount = 0;
  let unfinished = 0;
  for (const r of rows) {
    counts.total += 1;
    if (r.status === "completed") {
      counts.completed += 1;
      if (r.passed === false) counts.failed += 1;
      if (typeof r.scorePercent === "number") {
        scoreSum += r.scorePercent;
        scoreCount += 1;
      }
      continue;
    }
    unfinished += 1;
    if (r.isOverdue) counts.overdue += 1;
    if (r.schedule === "behind") counts.behind += 1;
    if (r.status === "in_progress") counts.inProgress += 1;
    if (r.status === "not_started") counts.notStarted += 1;
  }
  counts.avgScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null;

  const lastSeen = e.lastSeenAt ? new Date(e.lastSeenAt) : null;
  const inactive = !lastSeen || now.getTime() - lastSeen.getTime() > INACTIVE_DAYS * DAY_MS;

  let segment: PersonSegment | null = null;
  if (counts.total > 0) {
    if (counts.overdue > 0) segment = "overdue";
    else if (counts.behind > 0) segment = "behind";
    else if (counts.notStarted === counts.total) segment = "not_started";
    else if (inactive && unfinished > 0) segment = "inactive";
    else segment = "on_track";
  }

  return {
    id: e.id,
    name: e.name,
    avatarUrl: e.avatarUrl,
    positionCode: e.position?.code ?? null,
    positionName: e.position?.name ?? null,
    positionLevel: e.position?.level ?? null,
    managerId: e.managerId,
    lastSeenAt: iso(e.lastSeenAt),
    lastSeenLabel: lastSeen ? formatRelativeTime(lastSeen, now) : "ще не заходив(ла)",
    inactive,
    segment,
    counts,
    urgency: counts.overdue * 3 + counts.behind * 2 + counts.notStarted + (inactive && unfinished > 0 ? 1 : 0),
    activeWeeks: weeks ? Array.from(weeks).sort((a, b) => a - b) : [],
  };
}

/* ---------------- Похідні для дашборда ---------------- */

/** `count` — ЛЮДИ (сегментація worst-wins, саме їм пишуть «Нагадати»);
 *  `courses` — скільки призначень команди в цьому стані (null для
 *  «неактивні»: це властивість людини, а не курсу). Два числа поруч, бо
 *  «Прострочено 7» без одиниці читалось як 7 курсів, хоча курсів 8
 *  (скарга користувача, 2026-09-23). */
export type StatusBarSegment = { key: PersonSegment; label: string; count: number; courses: number | null; href: string };

export function statusBar(people: TeamPerson[], rows: TeamRow[]): { segments: StatusBarSegment[]; total: number; noEnrollments: number } {
  const counts = new Map<PersonSegment, number>(SEGMENT_ORDER.map((k) => [k, 0]));
  let noEnrollments = 0;
  for (const p of people) {
    if (p.segment == null) noEnrollments += 1;
    else counts.set(p.segment, (counts.get(p.segment) || 0) + 1);
  }
  const unfinished = rows.filter((r) => r.status !== "completed");
  const courseCounts: Record<PersonSegment, number | null> = {
    overdue: unfinished.filter((r) => r.isOverdue).length,
    behind: unfinished.filter((r) => !r.isOverdue && r.schedule === "behind").length,
    not_started: unfinished.filter((r) => !r.isOverdue && r.schedule !== "behind" && r.status === "not_started").length,
    inactive: null,
    on_track: rows.filter((r) => r.status === "completed" || (!r.isOverdue && r.schedule !== "behind" && r.status !== "not_started")).length,
  };
  const segments = SEGMENT_ORDER.map((key) => ({
    key,
    label: SEGMENT_META[key].label,
    count: counts.get(key) || 0,
    courses: courseCounts[key],
    href: `/manager/team?status=${key}`,
  }));
  return { segments, total: people.length - noEnrollments, noEnrollments };
}

export type AttentionReason = {
  kind: PersonSegment;
  label: string;
  /** Скільки курсів у цьому стані (для «неактивний» — 0). */
  count: number;
  courseId: number | null;
  courseSlug: string | null;
  courseTitle: string | null;
  dueDateLabel: string | null;
};

export type AttentionItem = { person: TeamPerson; reasons: AttentionReason[] };

/** Топ-N людей за терміновістю; причини — по одній на вид, з найгіршим
 *  курсом (найдавніший дедлайн) як прикладом для тексту нагадування. */
export function attentionTop(people: TeamPerson[], rows: TeamRow[], limit = ATTENTION_LIMIT): AttentionItem[] {
  const rowsByEmployee = new Map<number, TeamRow[]>();
  for (const r of rows) {
    const list = rowsByEmployee.get(r.employeeId) || [];
    list.push(r);
    rowsByEmployee.set(r.employeeId, list);
  }
  return people
    .filter((p) => p.urgency > 0)
    .sort((a, b) => b.urgency - a.urgency || a.name.localeCompare(b.name, "uk"))
    .slice(0, limit)
    .map((person) => {
      const mine = (rowsByEmployee.get(person.id) || []).slice().sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));
      const reasons: AttentionReason[] = [];
      const pick = (kind: PersonSegment, test: (r: TeamRow) => boolean, count: number) => {
        const r = mine.find(test);
        if (!r) return;
        reasons.push({
          kind,
          label: reasonLabel(kind, count),
          count,
          courseId: r.courseId,
          courseSlug: r.courseSlug,
          courseTitle: r.courseTitle,
          dueDateLabel: r.dueDateLabel,
        });
      };
      pick("overdue", (r) => r.isOverdue, person.counts.overdue);
      pick("behind", (r) => r.schedule === "behind", person.counts.behind);
      if (person.counts.notStarted > 0) pick("not_started", (r) => r.status === "not_started", person.counts.notStarted);
      if (person.inactive && person.segment !== "on_track" && person.counts.total > person.counts.completed) {
        reasons.push({
          kind: "inactive",
          label: `не заходив(ла) ${person.lastSeenLabel === "ще не заходив(ла)" ? "жодного разу" : `з ${person.lastSeenLabel}`}`,
          count: 0,
          courseId: null,
          courseSlug: null,
          courseTitle: null,
          dueDateLabel: null,
        });
      }
      return { person, reasons };
    });
}

export type MatrixCourse = { id: number; slug: string; title: string };
export type MatrixRow = { person: TeamPerson; cells: { courseSlug: string; status: CellStatus | null; enrollmentId: number | null }[] };
export type TeamMatrixData = { courses: MatrixCourse[]; rows: MatrixRow[]; hiddenPeople: number };

/** Люди × курси. Люди — за терміновістю (проблемні зверху), курси — за
 *  кількістю призначень у команді; рядки обрізаються rowCap-ом. */
export function buildMatrix(people: TeamPerson[], rows: TeamRow[], rowCap = MATRIX_ROW_CAP): TeamMatrixData {
  const courseCount = new Map<number, MatrixCourse & { n: number }>();
  for (const r of rows) {
    const c = courseCount.get(r.courseId) || { id: r.courseId, slug: r.courseSlug, title: r.courseTitle, n: 0 };
    c.n += 1;
    courseCount.set(r.courseId, c);
  }
  const courses = Array.from(courseCount.values())
    .sort((a, b) => b.n - a.n || a.title.localeCompare(b.title, "uk"))
    .map(({ id, slug, title }) => ({ id, slug, title }));
  const cellByKey = new Map(rows.map((r) => [`${r.employeeId}:${r.courseId}`, r]));
  const withCourses = people.filter((p) => p.counts.total > 0).sort((a, b) => b.urgency - a.urgency || a.name.localeCompare(b.name, "uk"));
  const shown = withCourses.slice(0, rowCap);
  return {
    courses,
    rows: shown.map((person) => ({
      person,
      cells: courses.map((c) => {
        const r = cellByKey.get(`${person.id}:${c.id}`);
        return { courseSlug: c.slug, status: r ? r.cell : null, enrollmentId: r ? r.enrollmentId : null };
      }),
    })),
    hiddenPeople: withCourses.length - shown.length,
  };
}

export type CourseFunnel = { id: number; slug: string; title: string; assigned: number; started: number; passed: number; perfect: number };

export function courseFunnels(rows: TeamRow[]): CourseFunnel[] {
  const byCourse = new Map<number, CourseFunnel>();
  for (const r of rows) {
    const f = byCourse.get(r.courseId) || { id: r.courseId, slug: r.courseSlug, title: r.courseTitle, assigned: 0, started: 0, passed: 0, perfect: 0 };
    f.assigned += 1;
    if (r.status !== "not_started" || r.modulesPassed > 0) f.started += 1;
    if (r.status === "completed" && r.passed === true) {
      f.passed += 1;
      if (r.scorePercent === 100) f.perfect += 1;
    }
    byCourse.set(r.courseId, f);
  }
  return Array.from(byCourse.values()).sort((a, b) => b.assigned - a.assigned || a.title.localeCompare(b.title, "uk"));
}

/* ---------------- Сторінка списку: URL → фільтри ---------------- */

export type TeamView = "people" | "courses";
export type TeamQuery = {
  view: TeamView;
  status: string | null;
  due: string | null;
  score: string | null;
  course: string | null;
  stage: string | null;
  module: number | null;
  retried: boolean;
  timing: string | null;
  week: number | null;
  team: number | null;
  q: string;
  sort: "urgency" | "name" | "score";
};

const PEOPLE_STATUSES = new Set([...SEGMENT_ORDER, "none"]);
const COURSE_STATUSES = new Set(["not_started", "in_progress", "overdue", "completed", "passed", "failed", "behind"]);
const DUE_KEYS = new Set(["overdue", "week", "month", "later", "none"]);
const SCORE_KEYS = new Set(["lt60", "s60", "s80", "s90", "s100"]);
const STAGES = new Set(["assigned", "started", "passed", "perfect"]);

type SearchParamsLike = Record<string, string | string[] | undefined> | null | undefined;

function one(sp: SearchParamsLike, key: string): string | null {
  const v = sp?.[key];
  if (Array.isArray(v)) return v[0] ?? null;
  return typeof v === "string" && v !== "" ? v : null;
}

/** Ціле з query або null — саме null, не 0: Number(null) === 0, і
 *  відсутній параметр читався б як «нульовий тиждень». */
function int(sp: SearchParamsLike, key: string): number | null {
  const raw = one(sp, key);
  if (raw == null || !/^-?\d+$/.test(raw)) return null;
  return Number(raw);
}

export function parseTeamQuery(sp: SearchParamsLike): TeamQuery {
  const due = one(sp, "due");
  const score = one(sp, "score");
  const stage = one(sp, "stage");
  const moduleId = int(sp, "module");
  const week = int(sp, "week");
  const team = int(sp, "team");
  const retried = one(sp, "retried") === "1";
  const timing = one(sp, "timing");
  const courseSlug = one(sp, "course");
  const forcesCourses = Boolean(due || score || stage || (moduleId != null && moduleId > 0) || retried || timing === "late");
  const view: TeamView = one(sp, "view") === "courses" || forcesCourses ? "courses" : "people";
  const rawStatus = one(sp, "status");
  const status = rawStatus && (view === "people" ? PEOPLE_STATUSES : COURSE_STATUSES).has(rawStatus) ? rawStatus : null;
  const sortRaw = one(sp, "sort");
  return {
    view,
    status,
    due: due && DUE_KEYS.has(due) ? due : null,
    score: score && SCORE_KEYS.has(score) ? score : null,
    course: courseSlug,
    stage: stage && STAGES.has(stage) ? stage : null,
    module: moduleId != null && moduleId > 0 ? moduleId : null,
    retried,
    timing: timing === "late" ? "late" : null,
    week: week != null && week >= 0 && week < TREND_WEEKS ? week : null,
    team: team != null && team > 0 ? team : null,
    q: (one(sp, "q") || "").trim().toLowerCase(),
    sort: sortRaw === "name" || sortRaw === "score" ? sortRaw : "urgency",
  };
}

/** Серіалізація назад в URL — для чипів «зняти фільтр» і перемикачів. */
export function teamQueryHref(query: Partial<TeamQuery>): string {
  const params = new URLSearchParams();
  if (query.view === "courses") params.set("view", "courses");
  if (query.status) params.set("status", query.status);
  if (query.due) params.set("due", query.due);
  if (query.score) params.set("score", query.score);
  if (query.course) params.set("course", query.course);
  if (query.stage) params.set("stage", query.stage);
  if (query.module) params.set("module", String(query.module));
  if (query.retried) params.set("retried", "1");
  if (query.timing) params.set("timing", query.timing);
  if (query.week != null) params.set("week", String(query.week));
  if (query.team) params.set("team", String(query.team));
  if (query.q) params.set("q", query.q);
  if (query.sort && query.sort !== "urgency") params.set("sort", query.sort);
  const s = params.toString();
  return `/manager/team${s ? `?${s}` : ""}`;
}

/** id людей у піддереві rootId (включно з ним) — за ланцюжком managerId
 *  серед видимої команди. Чужий rootId → порожньо → фільтр ігнорується. */
export function subtreeIds(people: TeamPerson[], rootId: number): Set<number> {
  const byManager = new Map<number, number[]>();
  for (const p of people) {
    if (p.managerId == null) continue;
    const list = byManager.get(p.managerId) || [];
    list.push(p.id);
    byManager.set(p.managerId, list);
  }
  const out = new Set<number>();
  if (!people.some((p) => p.id === rootId)) return out;
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const child of byManager.get(id) || []) stack.push(child);
  }
  return out;
}

/** Ті, хто провалив першу спробу (той самий критерій, що computeFirstAttempt
 *  у lib/managerDashboard.js — «З першої спроби»). */
export function retriedEnrollmentIds(attempts: RawAttempt[]): Set<number> {
  const first = new Map<number, RawAttempt>();
  for (const a of attempts) {
    const prev = first.get(a.enrollmentId);
    if (!prev || new Date(a.completedAt).getTime() < new Date(prev.completedAt).getTime()) first.set(a.enrollmentId, a);
  }
  const out = new Set<number>();
  for (const a of first.values()) if (a.passed !== true) out.add(a.enrollmentId);
  return out;
}

function dueBucket(r: TeamRow, now: Date): string | null {
  if (r.status === "completed") return null;
  if (!r.dueDate) return "none";
  const days = (new Date(r.dueDate).getTime() - now.getTime()) / DAY_MS;
  if (r.isOverdue) return "overdue";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "later";
}

function scoreBucket(r: TeamRow): string | null {
  if (r.status !== "completed" || typeof r.scorePercent !== "number") return null;
  if (r.scorePercent < 60) return "lt60";
  if (r.scorePercent < 80) return "s60";
  if (r.scorePercent < 90) return "s80";
  if (r.scorePercent < 100) return "s90";
  return "s100";
}

export type TeamListResult = {
  query: TeamQuery;
  people: TeamPerson[];
  rows: TeamRow[];
};

export function applyTeamFilters(
  allRows: TeamRow[],
  allPeople: TeamPerson[],
  query: TeamQuery,
  ctx: { now: Date; retried: Set<number> }
): TeamListResult {
  let people = allPeople;
  if (query.team) {
    const ids = subtreeIds(allPeople, query.team);
    if (ids.size > 0) people = people.filter((p) => ids.has(p.id));
  }
  if (query.q) people = people.filter((p) => p.name.toLowerCase().includes(query.q));
  const personIds = new Set(people.map((p) => p.id));
  let rows = allRows.filter((r) => personIds.has(r.employeeId));

  if (query.view === "people") {
    if (query.status === "none") people = people.filter((p) => p.segment == null);
    else if (query.status) people = people.filter((p) => p.segment === query.status);
    if (query.week != null) people = people.filter((p) => p.activeWeeks.includes(query.week!));
    if (query.course) {
      const withCourse = new Set(rows.filter((r) => r.courseSlug === query.course).map((r) => r.employeeId));
      people = people.filter((p) => withCourse.has(p.id));
    }
  } else {
    if (query.course) rows = rows.filter((r) => r.courseSlug === query.course);
    if (query.status === "passed") rows = rows.filter((r) => r.status === "completed" && r.passed === true);
    else if (query.status === "failed") rows = rows.filter((r) => r.status === "completed" && r.passed === false);
    else if (query.status === "behind") rows = rows.filter((r) => r.schedule === "behind");
    else if (query.status === "overdue") rows = rows.filter((r) => r.isOverdue);
    else if (query.status) rows = rows.filter((r) => r.status === query.status);
    if (query.due) rows = rows.filter((r) => dueBucket(r, ctx.now) === query.due);
    if (query.score) rows = rows.filter((r) => scoreBucket(r) === query.score);
    if (query.stage === "started") rows = rows.filter((r) => r.status !== "not_started" || r.modulesPassed > 0);
    else if (query.stage === "passed") rows = rows.filter((r) => r.status === "completed" && r.passed === true);
    else if (query.stage === "perfect") rows = rows.filter((r) => r.status === "completed" && r.passed === true && r.scorePercent === 100);
    if (query.module) rows = rows.filter((r) => r.failedModuleIds.includes(query.module!));
    if (query.retried) rows = rows.filter((r) => ctx.retried.has(r.enrollmentId));
    if (query.timing === "late") rows = rows.filter((r) => r.isLate);
    const withRows = new Set(rows.map((r) => r.employeeId));
    people = people.filter((p) => withRows.has(p.id));
  }

  const byId = new Map(people.map((p) => [p.id, p]));
  const sorter =
    query.sort === "name"
      ? (a: TeamPerson, b: TeamPerson) => a.name.localeCompare(b.name, "uk")
      : query.sort === "score"
        ? (a: TeamPerson, b: TeamPerson) => (b.counts.avgScore ?? -1) - (a.counts.avgScore ?? -1) || a.name.localeCompare(b.name, "uk")
        : (a: TeamPerson, b: TeamPerson) => b.urgency - a.urgency || a.name.localeCompare(b.name, "uk");
  people = people.slice().sort(sorter);
  const order = new Map(people.map((p, i) => [p.id, i]));
  rows = rows
    .filter((r) => byId.has(r.employeeId))
    .sort((a, b) => (order.get(a.employeeId)! - order.get(b.employeeId)!) || (a.dueDate || "9").localeCompare(b.dueDate || "9"));

  return { query, people, rows };
}

/** Підпис активного фільтра для чипа на сторінці списку. */
export function describeTeamQuery(query: TeamQuery, courseTitle?: string | null, moduleTitle?: string | null, teamName?: string | null): { key: keyof TeamQuery; label: string }[] {
  const out: { key: keyof TeamQuery; label: string }[] = [];
  const dueLabels: Record<string, string> = { overdue: "прострочено", week: "до 7 днів", month: "7–30 днів", later: "понад 30 днів", none: "без дедлайну" };
  const scoreLabels: Record<string, string> = { lt60: "бал до 60%", s60: "бал 60–79%", s80: "бал 80–89%", s90: "бал 90–99%", s100: "бал 100%" };
  const courseStatus: Record<string, string> = { not_started: "не розпочато", in_progress: "в процесі", overdue: "прострочено", completed: "завершено", passed: "складено", failed: "не складено", behind: "відстають" };
  const stageLabels: Record<string, string> = { assigned: "призначено", started: "почали", passed: "склали", perfect: "на 100%" };
  if (query.status) out.push({ key: "status", label: query.view === "people" ? (query.status === "none" ? "без призначень" : SEGMENT_META[query.status as PersonSegment].label) : courseStatus[query.status] });
  if (query.due) out.push({ key: "due", label: dueLabels[query.due] });
  if (query.score) out.push({ key: "score", label: scoreLabels[query.score] });
  if (query.course) out.push({ key: "course", label: courseTitle || query.course });
  if (query.stage) out.push({ key: "stage", label: stageLabels[query.stage] });
  if (query.module) out.push({ key: "module", label: moduleTitle ? `провалили «${moduleTitle}»` : `провалили модуль #${query.module}` });
  if (query.retried) out.push({ key: "retried", label: "не з першої спроби" });
  if (query.timing) out.push({ key: "timing", label: "не вчасно" });
  if (query.week != null) out.push({ key: "week", label: query.week === 0 ? "активні цього тижня" : `активні ${query.week} тиж. тому` });
  if (query.team) out.push({ key: "team", label: teamName ? `команда: ${teamName}` : "підкоманда" });
  if (query.q) out.push({ key: "q", label: `«${query.q}»` });
  return out;
}
