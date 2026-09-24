/**
 * Чиста логіка сповіщень (без prisma) — саме її перевіряють тести.
 * lib/notifications.js лише дістає дані з БД і передає сюди.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** За скільки днів до дедлайну нагадуємо. Кожне нагадування — своя подія
 * з власним dedupeKey, тож людина отримає рівно одне «за 3 дні» і одне
 * «за 1 день», скільки б разів cron не запускався. */
export const DEADLINE_REMINDER_DAYS = [3, 1];

/**
 * Які нагадування про дедлайн створити зараз.
 *
 * Правило: нагадування «за N днів» належить, коли до дедлайну лишилось
 * ≤ N днів і він ще не минув. Cron щоденний, тож «за 3 дні» спрацює десь
 * між 3 і 2 днями до терміну — це нормально; головне, що dedupeKey не дасть
 * повторити. Прострочені тут не розглядаються — це окрема подія
 * enrollment_overdue (lib/overdueEnrollments.js).
 *
 * @param {Array<{id:number, employeeId:number, dueDate:Date|null, status:string, course:{title:string, slug:string}}>} enrollments
 * @param {Date} now
 * @returns {Array<{employeeId:number, type:string, dedupeKey:string, daysLeft:number, enrollment:object}>}
 */
export function selectDeadlineReminders(enrollments, now = new Date()) {
  const out = [];
  for (const e of enrollments) {
    if (!e.dueDate || e.status === "completed") continue;
    const msLeft = new Date(e.dueDate) - now;
    if (msLeft <= 0) continue;
    const daysLeft = msLeft / DAY_MS;
    for (const n of DEADLINE_REMINDER_DAYS) {
      if (daysLeft <= n) {
        out.push({
          employeeId: e.employeeId,
          type: `deadline_${n}d`,
          dedupeKey: `deadline:${e.id}:${n}d`,
          daysLeft: Math.ceil(daysLeft),
          enrollment: e,
        });
      }
    }
  }
  return out;
}

/**
 * Шаблон «Нагадати» з кабінету керівника (/manager/team) — підставляється
 * в діалог, керівник може відредагувати перед відправкою.
 * @param {"overdue"|"behind"|"not_started"|"inactive"|"general"} reason
 * @param {string|null} courseTitle
 * @param {string|null} dueDateLabel
 */
/**
 * @param {"overdue"|"behind"|"not_started"|"inactive"|"failed"|"general"} reason
 * @param {string|null} [courseTitle]
 * @param {string|null} [dueDateLabel]
 */
export function managerReminderText(reason, courseTitle = null, dueDateLabel = null) {
  // Відмінки: «по курсу «X»» / «по призначених курсах», «курс «X»» /
  // «призначені курси» — без курсу фраза має лишатись граматичною.
  const byCourse = courseTitle ? `по курсу «${courseTitle}»` : "по призначених курсах";
  const theCourse = courseTitle ? `курс «${courseTitle}»` : "призначені курси";
  const due = dueDateLabel ? ` — термін до ${dueDateLabel}` : "";
  if (reason === "overdue") return `Термін ${byCourse} минув${dueDateLabel ? ` (${dueDateLabel})` : ""}. Будь ласка, завершіть найближчим часом.`;
  if (reason === "behind") return `Ви відстаєте від графіка ${byCourse}. Спробуйте надолужити цього тижня.`;
  if (reason === "not_started") return `Ви ще не розпочали ${theCourse}${due}. Час почати.`;
  if (reason === "inactive") return "Давно не бачили вас на платформі — загляньте, є курси, що чекають.";
  // «Не складено» — курс пройдено до кінця, але прохідний бал не набрано:
  // нагадування тут не про терміни, а про повторну спробу.
  if (reason === "failed") return `${courseTitle ? `Курс «${courseTitle}»` : "Один із курсів"} не складено — перегляньте матеріал і спробуйте ще раз.`;
  return `Нагадую про ${theCourse}${due}.`;
}

/**
 * «Похвалити» з кабінету керівника (2026-09-24) — пара до «Нагадати» для
 * складених курсів: керівник бачив кнопку лише на проблемних призначеннях,
 * а відзначити людину за результат не мав чим. Той самий діалог, той
 * самий канал доставки, інший шаблон.
 */
/** @param {string|null} [courseTitle] */
export function managerPraiseText(courseTitle = null) {
  if (courseTitle) return `Вітаю зі складеним курсом «${courseTitle}»! Чудовий результат — так тримати.`;
  return "Вітаю — усі призначені курси складено! Дякую за відповідальність, так тримати.";
}

/** Текст нагадування — одна фраза, без «залишилось 0.7 дня». */
export function deadlineReminderText(daysLeft, courseTitle) {
  if (daysLeft <= 1) return `Завтра останній день: «${courseTitle}» ще не пройдено.`;
  return `До кінця терміну «${courseTitle}» — ${daysLeft} дн.`;
}

/**
 * Денний підсумок керівнику по підлеглих за минулу добу: хто завершив
 * (і з яким балом), у кого прострочено. Порожній — нічого не шлемо.
 *
 * @param {Array<{employee:{name:string}, course:{title:string}, scorePercent:number|null, status:string, completedAt:Date|null}>} events
 * @returns {{title:string, message:string}|null}
 */
export function buildTeamDigest(events) {
  const completed = events.filter((e) => e.status === "completed" && e.completedAt);
  const overdue = events.filter((e) => e.status === "overdue");
  if (completed.length === 0 && overdue.length === 0) return null;

  const parts = [];
  if (completed.length > 0) {
    const perfect = completed.filter((e) => e.scorePercent === 100).length;
    const names = completed
      .slice(0, 3)
      .map((e) => `${e.employee.name} — «${e.course.title}» (${e.scorePercent ?? "—"}%)`)
      .join("; ");
    parts.push(
      `Завершили курси: ${completed.length}${perfect ? ` (на 100%: ${perfect})` : ""}. ${names}${completed.length > 3 ? "…" : ""}`
    );
  }
  if (overdue.length > 0) {
    const names = overdue
      .slice(0, 3)
      .map((e) => `${e.employee.name} — «${e.course.title}»`)
      .join("; ");
    parts.push(`Прострочено: ${overdue.length}. ${names}${overdue.length > 3 ? "…" : ""}`);
  }

  return {
    title: `Команда за добу: ${completed.length} завершено, ${overdue.length} прострочено`,
    message: parts.join(" "),
  };
}

/** Дата у форматі YYYY-MM-DD для dedupeKey дайджесту. */
export function dateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}
