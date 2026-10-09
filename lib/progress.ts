import { DAY_MS } from "@/lib/kyivTime";

type DateLike = Date | string | number;

/** Мінімум полів призначення (Enrollment), з якими працюють правила нижче. */
export type EnrollmentLike = {
  status: string;
  passed?: boolean | null;
  scorePercent?: number | null;
  dueDate?: DateLike | null;
  assignedAt?: DateLike | null;
  isMandatory?: boolean;
  course?: { publishAt?: DateLike | null; [key: string]: unknown } | null;
};

export type MedalTier = "gold" | "silver" | "bronze";

/**
 * Золото — рівно 100%, срібло — 95-99%, бронза — 90-94%, нижче 90% — без
 * медалі. Одна шкала для картки курсу, кабінету керівника й Excel-звіту.
 */
export function medalTier(scorePercent: number | null | undefined): MedalTier | null {
  if (scorePercent == null) return null;
  if (scorePercent >= 100) return "gold";
  if (scorePercent >= 95) return "silver";
  if (scorePercent >= 90) return "bronze";
  return null;
}

/**
 * Скільки модулів курсу вже СКЛАДЕНО — смуга прогресу на картці курсу
 * («складено N з M модулів», а не бал: у незавершеного курсу бал завжди 0,
 * і курс з одним складеним модулем із десяти виглядав незрушеним). Джерело —
 * список модулів зі статусами (lib/courseContent.js getModuleStatusList).
 */
export function moduleProgress(modules: { status: string }[] | null | undefined) {
  const total = modules?.length || 0;
  if (!modules || total === 0) return { passed: 0, total: 0, pct: 0 };
  const passed = modules.filter((m) => m.status === "completed").length;
  return { passed, total, pct: Math.round((passed / total) * 100) };
}

/**
 * Стан призначення для картки курсу. pct — БАЛ завершеного курсу, не прогрес
 * проходження (прогрес — moduleProgress вище).
 */
export function courseTileStatus(enrollment: EnrollmentLike | null | undefined) {
  if (!enrollment) return { status: "not_started", pct: 0 };
  if (enrollment.status === "completed") {
    return { status: "completed", pct: enrollment.scorePercent ?? 0, passed: Boolean(enrollment.passed) };
  }
  if (enrollment.status === "in_progress") return { status: "in_progress", pct: 0 };
  return { status: "not_started", pct: 0 };
}

/**
 * «Нове» на картці курсу — призначений за останні `days` днів і ще не
 * розпочатий. З першим рухом (in_progress/completed) мітка зникає незалежно
 * від дати: сенс саме «ти ще навіть не відкривав це».
 */
export function isRecentlyAssigned(enrollment: EnrollmentLike | null | undefined, now = new Date(), days = 3): boolean {
  if (!enrollment || !enrollment.assignedAt || enrollment.status !== "not_started") return false;
  const diffMs = now.getTime() - new Date(enrollment.assignedAt).getTime();
  return diffMs >= 0 && diffMs <= days * DAY_MS;
}

/**
 * Курс ще треба доробити: не завершено, АБО завершено, але НЕ складено.
 * Провалений курс має status "completed" — без цього правила людина, що
 * провалила обов'язковий курс, ніколи не ставала б простроченою і не бачила б
 * його на головній.
 */
export function isUnfinished(enrollment: EnrollmentLike | null | undefined): boolean {
  return Boolean(enrollment) && (enrollment!.status !== "completed" || enrollment!.passed === false);
}

/**
 * Прострочено: дедлайн минув, а курс не складено. Одне правило для всіх
 * екранів і звітів (рішення користувача 2026-10-09) — не чекає нічного cron
 * і не дивиться на status "overdue" (той лишається подією для сповіщень).
 */
export function isOverdue(enrollment: EnrollmentLike | null | undefined, now = new Date()): boolean {
  if (!enrollment || !enrollment.dueDate || !isUnfinished(enrollment)) return false;
  return new Date(enrollment.dueDate).getTime() < now.getTime();
}

/** Курс складено: дійшов до кінця і набрав прохідний бал. */
export function isPassed(e: EnrollmentLike): boolean {
  return e.status === "completed" && e.passed === true;
}

/**
 * Сертифікат заслужено: курс завершено на 100% і КОЖЕН модуль курсу складено
 * на 100% (рішення користувача 2026-10-09 — округлення «999 з 1000 = 100%»
 * сертифіката не дає). Одне правило для PDF, «Досягнень», картки курсу,
 * плану й фінального екрана; Course.certificateEnabled перевіряє викликач.
 *
 * @param moduleScores бал кожного модуля курсу (null/undefined — модуль не складався)
 */
export function certificateEarned(
  enrollment: EnrollmentLike | null | undefined,
  moduleScores: (number | null | undefined)[]
): boolean {
  return (
    enrollment?.status === "completed" &&
    enrollment.scorePercent === 100 &&
    moduleScores.length > 0 &&
    moduleScores.every((s) => s === 100)
  );
}

// Порядок для «Продовжити навчання»: прострочені → початі (і провалені —
// їх треба перескласти) → ще не відкриті.
const CONTINUE_STATUS_PRIORITY: Record<string, number> = { overdue: 0, in_progress: 1, completed: 1, not_started: 2 };

/**
 * До `limit` незавершених призначень для головного екрана за пріоритетом
 * статусу; всередині однакового статусу порядок вхідного списку зберігається.
 */
export function pickContinueEnrollments<T extends EnrollmentLike>(enrollments: T[], limit = 3): T[] {
  return enrollments
    .filter(isUnfinished)
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (CONTINUE_STATUS_PRIORITY[a.e.status] ?? 3) - (CONTINUE_STATUS_PRIORITY[b.e.status] ?? 3) || a.i - b.i)
    .slice(0, limit)
    .map(({ e }) => e);
}

const dueTs = (e: EnrollmentLike) => (e.dueDate ? new Date(e.dueDate).getTime() : Number.MAX_SAFE_INTEGER);
// Дата публікації курсу; без неї — дата призначення.
const publishedTs = (e: EnrollmentLike) => new Date(e.course?.publishAt || e.assignedAt || 0).getTime();

/**
 * Екран «Навчання»: обов'язкові не складені (прострочені перші, далі за датою
 * публікації — старіші вище), рекомендовані так само, складені — в кінці.
 * Незалік — це НЕ складено: курс лишається в активному списку.
 */
export function groupLearning<T extends EnrollmentLike>(enrollments: T[], now = new Date()) {
  const late = (e: T) => Number(isOverdue(e, now));
  const byPriority = (a: T, b: T) => late(b) - late(a) || publishedTs(a) - publishedTs(b) || dueTs(a) - dueTs(b);
  const active = enrollments.filter((e) => !isPassed(e));
  return {
    mandatory: active.filter((e) => e.isMandatory).sort(byPriority),
    optional: active.filter((e) => !e.isMandatory).sort(byPriority),
    completed: enrollments.filter(isPassed),
  };
}

/** Один список без секцій («Мої курси» керівника): прострочені → решта не складених → складені. */
export function sortByUrgency<T extends EnrollmentLike>(enrollments: T[], now = new Date()): T[] {
  const bucket = (e: T) => (isPassed(e) ? 2 : isOverdue(e, now) ? 0 : 1);
  return [...enrollments].sort((a, b) => bucket(a) - bucket(b) || publishedTs(a) - publishedTs(b) || dueTs(a) - dueTs(b));
}
