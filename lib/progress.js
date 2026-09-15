/**
 * Золото — рівно 100%, срібло — 95-99%, бронза — 90-94%, нижче 90% — без
 * медалі. Спільна для картки курсу співробітника (CourseTile) і кабінету
 * керівника (ManagerDashboard) — раніше була продубльована в обох, тепер
 * єдине джерело правди на бал/медаль.
 */
export function medalTier(scorePercent) {
  if (scorePercent == null) return null;
  if (scorePercent >= 100) return "gold";
  if (scorePercent >= 95) return "silver";
  if (scorePercent >= 90) return "bronze";
  return null;
}

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

// Порядок пріоритету для "Продовжити навчання" — прострочені найважливіші
// (треба наздоганяти), потім ті, що вже почали (доробити), потім ще не
// відкриті. "completed" сюди взагалі не потрапляє (див. pickContinueEnrollments).
const CONTINUE_STATUS_PRIORITY = { overdue: 0, in_progress: 1, not_started: 2 };

/**
 * До `limit` незавершених призначень для домашнього екрана — не одне, як
 * було, а кілька, щоб було видно все, чим варто зайнятись зараз, а не лише
 * найстаріше з них. Сортування — за пріоритетом статусу, всередині
 * однакового статусу порядок enrollments зберігається (findFirst-подібна
 * стабільність, не додаткове перемішування).
 */
export function pickContinueEnrollments(enrollments, limit = 3) {
  return enrollments
    .filter((e) => e.status !== "completed")
    .map((e, i) => ({ e, i })) // стабільне сортування: JS Array#sort не гарантує
    // стабільність для дуже старих рушіїв, тому явно тримаємо початковий
    // індекс як tie-breaker — той самий трюк, що уникає випадкового
    // "тасування" однакових за пріоритетом enrollments між рендерами.
    .sort((a, b) => (CONTINUE_STATUS_PRIORITY[a.e.status] ?? 3) - (CONTINUE_STATUS_PRIORITY[b.e.status] ?? 3) || a.i - b.i)
    .slice(0, limit)
    .map(({ e }) => e);
}

const dueTs = (e) => (e.dueDate ? new Date(e.dueDate).getTime() : Number.MAX_SAFE_INTEGER);

/**
 * Екран «Навчання» замість плаского списку за датою призначення:
 *  - обов'язкові незавершені: прострочені перші, далі за найближчим дедлайном;
 *  - решта незавершених («рекомендовано»): розпочаті перші, далі за дедлайном;
 *  - пройдені — в кінці.
 * Enrollment.isMandatory — копія Course.isMandatory на момент призначення.
 */
export function groupLearning(enrollments, now = new Date()) {
  const late = (e) => e.status === "overdue" || isOverdue(e, now);
  const active = enrollments.filter((e) => e.status !== "completed");
  return {
    mandatory: active.filter((e) => e.isMandatory).sort((a, b) => late(b) - late(a) || dueTs(a) - dueTs(b)),
    optional: active
      .filter((e) => !e.isMandatory)
      .sort((a, b) => (b.status === "in_progress") - (a.status === "in_progress") || dueTs(a) - dueTs(b)),
    completed: enrollments.filter((e) => e.status === "completed"),
  };
}
