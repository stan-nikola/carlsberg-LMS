/**
 * Єдине джерело правди про типи компонентів екрана: як називаються в
 * /admin, яка структура content у кожного, і — головне — коли їхній "гейт"
 * вважається пройденим (кнопка «Далі» розблокована).
 *
 * (До 2026-09 цей файл називався lib/lessonTypes.js і описував типи цілого
 * Lesson/екрана — перейменовано разом із переходом на структуру
 * Course -> Module -> Screen -> Component, де один Screen тепер може
 * тримати кілька Component, кожен своєї миті типу.)
 *
 * Механіки портовані з попередньої vanilla-JS розробки "8 кроків
 * телесейлінгу": там кожен екран вимагав реальної взаємодії, перш ніж
 * пустити далі (відкрити всі картки, позначити чек-лист, дочитати діалог
 * дзвінка). Це не декоративне — саме воно не давало "проклацати" курс
 * не читаючи, тому механіку перенесено як є, а не спрощено.
 *
 * gateState — що саме компонент екрана повідомляє нагору (число вже
 * "зроблених" елементів); gateTotal рахується з самого content. Плеєр
 * тримає лише мапу componentId -> gateState і нічого не знає про
 * внутрішній устрій конкретної механіки.
 */

export const COMPONENT_TYPES = [
  { value: "info", label: "інфо-блок", hint: "Текст, фото, підказка «Варто знати»" },
  { value: "quiz", label: "питання", hint: "Один або кілька правильних варіантів" },
  { value: "accordion", label: "картки-акордеон", hint: "Далі — коли відкрито всі картки" },
  { value: "checklist", label: "чек-лист", hint: "Далі — коли позначено всі пункти" },
  { value: "script", label: "діалог-скрипт", hint: "Репліки дзвінка по одній; далі — коли дочитано" },
  { value: "timeline", label: "таймлайн кроків", hint: "Далі — коли торкнулись кожного кроку" },
  { value: "photo", label: "фото", hint: "Самостійне фото без інфо-тексту; гейта немає" },
  { value: "input", label: "поле вводу", hint: "Далі — коли щось введено (текст ніде не зберігається)" },
];

export const COMPONENT_TYPE_LABELS = Object.fromEntries(COMPONENT_TYPES.map((t) => [t.value, t.label]));

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
    case "photo":
      return { images: [] };
    case "input":
      return { label: "", placeholder: "", multiline: false };
    case "info":
    default:
      return { body: "", images: [] };
  }
}

/**
 * Скільки взаємодій потрібно на цьому компоненті. 0 = гейта немає (info,
 * photo), тобто «Далі» активна одразу.
 */
export function gateTotal(component) {
  const c = component?.content || {};
  switch (component?.type) {
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
    case "input":
      return 1;
    default:
      return 0;
  }
}

/** Чи можна пускати далі: done — скільки елементів уже "зроблено". */
export function isGateSatisfied(component, done) {
  const total = gateTotal(component);
  if (total === 0) return true;
  return (done || 0) >= total;
}

/** Текст-підказка під навігацією, поки компонент заблокований. */
export function gateHint(component) {
  const c = component?.content || {};
  if (c.gateMsg) return c.gateMsg;
  switch (component?.type) {
    case "accordion":
      return "Відкрийте всі картки, щоб продовжити";
    case "checklist":
      return "Позначте всі пункти чек-листа";
    case "script":
      return "Дочитайте діалог до кінця";
    case "timeline":
      return c.highlight ? "Торкніться виділеного кроку" : "Торкніться кожного кроку";
    case "input":
      return "Введіть щось, щоб продовжити";
    default:
      return "";
  }
}
