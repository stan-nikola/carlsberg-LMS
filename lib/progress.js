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
 * Скільки модулів курсу вже СКЛАДЕНО — прогрес проходження для картки
 * курсу (2026-09-17).
 *
 * Раніше смуга на картці показувала не прогрес, а БАЛ: у незавершеного
 * курсу вона була жорстко 0%, у завершеного — відсоток правильних
 * відповідей. Два різні сенси на одній смузі, через що курс із одним
 * складеним модулем із десяти виглядав як «нічого не зроблено»
 * (скарга користувача). Тепер смуга — це рівно «складено N з M модулів».
 *
 * Джерело — той самий список модулів зі статусами, що вже приходить у
 * картку (lib/courseContent.js getModuleStatusList), без додаткових
 * запитів. Курс без модулів прогресу не має — смуга не показується.
 *
 * @param {{ status: string }[]} modules
 */
export function moduleProgress(modules) {
  const total = modules?.length || 0;
  if (total === 0) return { passed: 0, total: 0, pct: 0 };
  const passed = modules.filter((m) => m.status === "completed").length;
  return { passed, total, pct: Math.round((passed / total) * 100) };
}

/**
 * Статус конкретного Enrollment для карточки курса (аналог readCourseStatus
 * из legacy js/cabinet.js, но источник данных — Enrollment из БД, а не
 * localStorage).
 *
 * pct тут — БАЛ (scorePercent) завершённого курса, НЕ прогресс
 * прохождения: прогресс считает moduleProgress() выше.
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
// Дата публікації курсу; без неї — дата призначення.
const publishedTs = (e) => new Date(e.course?.publishAt || e.assignedAt || 0).getTime();
const isPassed = (e) => e.status === "completed" && e.passed === true;

/**
 * Екран «Навчання» замість плаского списку за датою призначення:
 *  - обов'язкові, не складені: прострочені перші, далі за датою публікації
 *    (старіші вище) — користувач, 2026-09-15;
 *  - решта не складених («рекомендовано») — так само;
 *  - складені (залік) — в кінці. Незалік — це НЕ складено: курс лишається
 *    в активному списку, його треба пройти знову.
 * Enrollment.isMandatory — копія Course.isMandatory на момент призначення.
 */
export function groupLearning(enrollments, now = new Date()) {
  const late = (e) => e.status === "overdue" || isOverdue(e, now);
  const byPriority = (a, b) => late(b) - late(a) || publishedTs(a) - publishedTs(b) || dueTs(a) - dueTs(b);
  const active = enrollments.filter((e) => !isPassed(e));
  return {
    mandatory: active.filter((e) => e.isMandatory).sort(byPriority),
    optional: active.filter((e) => !e.isMandatory).sort(byPriority),
    completed: enrollments.filter(isPassed),
  };
}

/**
 * Один список без секцій («Мої курси» керівника, сітка карток):
 * прострочені → решта не складених (за датою публікації, старіші вище) →
 * складені. Та сама логіка, що groupLearning, лише без поділу на
 * обов’язкові/рекомендовані (користувач, 2026-09-15).
 */
export function sortByUrgency(enrollments, now = new Date()) {
  const late = (e) => e.status === "overdue" || isOverdue(e, now);
  const bucket = (e) => (isPassed(e) ? 2 : late(e) ? 0 : 1);
  return [...enrollments].sort((a, b) => bucket(a) - bucket(b) || publishedTs(a) - publishedTs(b) || dueTs(a) - dueTs(b));
}
