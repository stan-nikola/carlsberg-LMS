/**
 * Єдине джерело правди про типи екранів уроку: як називаються в /admin,
 * яка структура content у кожного, і — головне — коли їхній "гейт"
 * вважається пройденим (кнопка «Далі» розблокована).
 *
 * Механіки портовані з попередньої vanilla-JS розробки "8 кроків
 * телесейлінгу": там кожен екран вимагав реальної взаємодії, перш ніж
 * пустити далі (відкрити всі картки, позначити чек-лист, дочитати діалог
 * дзвінка). Це не декоративне — саме воно не давало "проклацати" курс
 * не читаючи, тому механіку перенесено як є, а не спрощено.
 *
 * gateState — що саме компонент екрана повідомляє нагору (число вже
 * "зроблених" елементів); gateTotal рахується з самого content. Плеєр
 * тримає лише мапу lessonId -> gateState і нічого не знає про
 * внутрішній устрій конкретної механіки.
 */

export const LESSON_TYPES = [
  { value: "info", label: "інфо-екран", hint: "Текст, фото, підказка «Варто знати»" },
  { value: "quiz", label: "питання", hint: "Один або кілька правильних варіантів" },
  { value: "accordion", label: "картки-акордеон", hint: "Далі — коли відкрито всі картки" },
  { value: "checklist", label: "чек-лист", hint: "Далі — коли позначено всі пункти" },
  { value: "script", label: "діалог-скрипт", hint: "Репліки дзвінка по одній; далі — коли дочитано" },
  { value: "timeline", label: "таймлайн кроків", hint: "Далі — коли торкнулись кожного кроку" },
];

export const LESSON_TYPE_LABELS = Object.fromEntries(LESSON_TYPES.map((t) => [t.value, t.label]));

/** Порожній content під щойно обраний тип — щоб редактор одразу мав із чим працювати. */
export function defaultContentForType(type) {
  switch (type) {
    case "quiz":
      return { questionType: "single", options: [{ text: "", correct: true }, { text: "", correct: false }] };
    case "accordion":
      return { lead: "", items: [{ title: "", body: "" }, { title: "", body: "" }] };
    case "checklist":
      return { lead: "", items: [{ text: "" }, { text: "" }] };
    case "script":
      return { lead: "", callLabel: "Дзвінок із клієнтом", bubbles: [{ role: "me", text: "" }, { role: "client", text: "" }] };
    case "timeline":
      return { lead: "", steps: [{ title: "", detail: "" }, { title: "", detail: "" }], highlight: null };
    case "info":
    default:
      return { body: "", images: [] };
  }
}

/**
 * Скільки взаємодій потрібно на цьому екрані. 0 = гейта немає (info),
 * тобто «Далі» активна одразу.
 */
export function gateTotal(lesson) {
  const c = lesson?.content || {};
  switch (lesson?.type) {
    case "accordion":
      return (c.items || []).length;
    case "checklist":
      return (c.items || []).length;
    case "script":
      return (c.bubbles || []).length;
    case "timeline":
      // Режим "ви тут" (highlight) вимагає торкнутись лише підсвіченого кроку —
      // як recap-екрани в legacy: там карта візиту показувалась повторно, і
      // змушувати щоразу відкривати всі 8 кроків було б покаранням за прогрес.
      return c.highlight ? 1 : (c.steps || []).length;
    default:
      return 0;
  }
}

/** Чи можна пускати далі: done — скільки елементів уже "зроблено". */
export function isGateSatisfied(lesson, done) {
  const total = gateTotal(lesson);
  if (total === 0) return true;
  return (done || 0) >= total;
}

/** Текст-підказка під навігацією, поки екран заблокований. */
export function gateHint(lesson) {
  const c = lesson?.content || {};
  if (c.gateMsg) return c.gateMsg;
  switch (lesson?.type) {
    case "accordion":
      return "Відкрийте всі картки, щоб продовжити";
    case "checklist":
      return "Позначте всі пункти чек-листа";
    case "script":
      return "Дочитайте діалог до кінця";
    case "timeline":
      return c.highlight ? "Торкніться виділеного кроку" : "Торкніться кожного кроку";
    default:
      return "";
  }
}
