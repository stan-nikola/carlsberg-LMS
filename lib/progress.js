/**
 * Статус конкретного Enrollment для карточки курса (аналог readCourseStatus
 * из legacy js/cabinet.js, но источник данных — Enrollment из БД, а не
 * localStorage).
 *
 * Точный процент прохождения "в процессе" (какой из 26 экранов курса открыт)
 * в БД пока не хранится — это появится вместе с самим плеером курса
 * (следующий шаг миграции). До тех пор in_progress просто показывает
 * "продовжте" без конкретного %.
 */
export function courseTileStatus(enrollment) {
  if (!enrollment) {
    return { status: "not_started", pct: 0 };
  }
  if (enrollment.status === "completed") {
    return {
      status: "completed",
      pct: enrollment.scorePercent ?? 0,
      passed: Boolean(enrollment.passed),
    };
  }
  if (enrollment.status === "in_progress") {
    return { status: "in_progress", pct: 0 };
  }
  return { status: "not_started", pct: 0 };
}

/**
 * "Нове" на картці курсу — недавно призначений (за замовчуванням, 3 дні
 * від Enrollment.assignedAt) і ще не розпочатий курс. Перестає бути
 * "новим" одразу, як тільки статус змінюється на in_progress/completed —
 * незалежно від дати, бо сенс мітки саме "ти ще навіть не відкривав це".
 */
export function isRecentlyAssigned(enrollment, now = new Date(), days = 3) {
  if (!enrollment || !enrollment.assignedAt || enrollment.status !== "not_started") return false;
  const diffMs = now.getTime() - new Date(enrollment.assignedAt).getTime();
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}

/**
 * Прострочений дедлайн — Enrollment.dueDate у минулому, і курс ще не
 * завершений (завершений курс, навіть якщо здали пізніше дедлайну, вже
 * не "прострочений" — тут нема чого наздоганяти).
 */
export function isOverdue(enrollment, now = new Date()) {
  if (!enrollment || !enrollment.dueDate || enrollment.status === "completed") return false;
  return new Date(enrollment.dueDate).getTime() < now.getTime();
}

/**
 * XP/уровень по всем назначениям сотрудника — портировано 1:1 из legacy
 * js/cabinet.js (100 XP за завершённый курс, +40 если что-то в процессе,
 * потолок 200 XP).
 */
export function computeXp(enrollments) {
  const completedCount = enrollments.filter((e) => e.status === "completed").length;
  const anyInProgress = enrollments.some((e) => e.status === "in_progress");

  const xp = Math.min(completedCount * 100 + (anyInProgress ? 40 : 0), 200);
  const xpMax = 200;
  const levelLabel = xp >= xpMax ? "Профі телесейлу" : xp >= 100 ? "Стажер адаптації" : "Новачок";

  return { xp, xpMax, levelLabel, completedCount };
}
