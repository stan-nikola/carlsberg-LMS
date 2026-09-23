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

import { zoneContains } from "@/lib/hotspotZones";

export const COMPONENT_TYPES = [
  { value: "info", label: "інфо-блок", hint: "Текст, фото, підказка «Варто знати»" },
  { value: "quiz", label: "питання", hint: "Один або кілька правильних варіантів" },
  { value: "accordion", label: "картки-акордеон", hint: "Далі — коли відкрито всі картки" },
  { value: "checklist", label: "чек-лист", hint: "Далі — коли позначено всі пункти" },
  { value: "script", label: "діалог-скрипт", hint: "Репліки дзвінка по одній; далі — коли дочитано" },
  { value: "timeline", label: "таймлайн кроків", hint: "Далі — коли торкнулись кожного кроку" },
  { value: "photo", label: "фото", hint: "Самостійне фото без інфо-тексту; гейта немає" },
  { value: "hotspot", label: "гаряча точка на фото", hint: "Знайти й натиснути потрібне місце на фото; іде в бал як питання" },
  { value: "ordering", label: "порядок кроків", hint: "Розставити кроки у правильному порядку; іде в бал як питання" },
  { value: "matching", label: "відповідність", hint: "Зіставити пари (термін — визначення); іде в бал як питання" },
];

/**
 * Типи, результат яких іде в БАЛ за модуль/курс, а не просто розблоковує
 * «Далі». Плеєр рахує scoreRaw як кількість таких компонентів із
 * відповіддю true, а scoreMax — як їхню загальну кількість.
 *
 * Гейти (accordion/checklist/...) сюди не входять принципово: там немає
 * правильної та неправильної відповіді, лише факт взаємодії.
 */
export const SCORED_COMPONENT_TYPES = ["quiz", "hotspot", "ordering", "matching"];

export function isScored(component) {
  return SCORED_COMPONENT_TYPES.includes(component?.type);
}

/**
 * Чи влучив клік у якусь із «гарячих зон» фото.
 *
 * Координати і радіус зберігаються у ВІДСОТКАХ від ШИРИНИ зображення —
 * те саме фото показується на телефоні й на ноутбуці різного розміру.
 * Через це відсоток по вертикалі «коротший» за відсоток по горизонталі
 * рівно у співвідношення сторін разів, і без домноження dy на aspectRatio
 * кругла зона перетворювалась би на еліпс: на широкому фото по вертикалі
 * зараховувало б набагато більшу область, ніж автор обвів.
 *
 * Влучанням вважається будь-яка зона: «покажи помилку на полиці» часто
 * має кілька однаково правильних відповідей.
 *
 * @param {{x:number,y:number}} point у відсотках від розміру зображення
 * @param {{x:number,y:number,r?:number}[]} zones
 * @param {number} aspectRatio висота/ширина зображення
 */
export function isHotspotHit(point, zones, aspectRatio) {
  // Друга лінія захисту від нульового/невідомого розміру кадру (перша —
  // у самому HotspotScreen): NaN у порівнянні завжди дає false, тобто
  // тихо записав би людині неправильну відповідь.
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y) || !Number.isFinite(aspectRatio)) {
    return false;
  }
  // Сама геометрія — в lib/hotspotZones.ts: там і прямокутник/овал
  // (рамка), і стара кругла зона, і вся правка зон у конструкторі. Одне
  // джерело на всі три місця, інакше автор обведе одне, а зарахується
  // інше.
  return (zones || []).some((zone) => zoneContains(zone, point, aspectRatio));
}

/**
 * Типи, які БІЛЬШЕ НЕ МОЖНА обрати в конструкторі, але які ще існують у
 * збереженому контенті. Прибрані зі списку вище — тобто новий такий
 * компонент не створити, — проте і далі рендеряться в плеєрі, мають
 * гейт і зберігають свою назву в навігації. Значення enum у БД
 * (ComponentType) навмисно НЕ видаляється: на момент відключення
 * "поля вводу" в реальних курсах було 30 таких компонентів, по одному на
 * модуль, і прибирати їх треба руками через конструктор, а не міграцією.
 */
export const RETIRED_COMPONENT_TYPES = [
  { value: "input", label: "поле вводу", hint: "Застарілий тип — новий створити не можна" },
];

export const COMPONENT_TYPE_LABELS = Object.fromEntries(
  [...COMPONENT_TYPES, ...RETIRED_COMPONENT_TYPES].map((t) => [t.value, t.label])
);

/** Порожній content під щойно обраний тип — щоб редактор одразу мав із чим працювати. */
export function defaultContentForType(type) {
  switch (type) {
    case "quiz":
      return {
        questionType: "single",
        images: [],
        // Перемішування — поведінка legacy-курсу ("8 кроків телесейлінгу"
        // перемішував варіанти на кожен показ). Курси тут пересдають, і
        // без перемішування з другого разу запам'ятовується ПОЗИЦІЯ
        // правильної відповіді, а не сама відповідь.
        shuffleOptions: true,
        explanation: "",
        options: [{ text: "", correct: true }, { text: "", correct: false }],
      };
    case "accordion":
      return { lead: "", images: [], items: [{ title: "", body: "" }, { title: "", body: "" }] };
    case "checklist":
      return { lead: "", images: [], items: [{ text: "" }, { text: "" }] };
    case "script":
      return { lead: "", images: [], callLabel: "Дзвінок із клієнтом", bubbles: [{ role: "me", text: "" }, { role: "client", text: "" }] };
    case "timeline":
      return { lead: "", images: [], steps: [{ title: "", detail: "" }, { title: "", detail: "" }], highlight: null };
    case "photo":
      return { images: [] };
    case "ordering":
      // Правильний порядок — той, у якому кроки стоять у конструкторі.
      // Плеєр показує їх перемішаними, людина відновлює послідовність.
      return { lead: "", images: [], items: [{ text: "" }, { text: "" }, { text: "" }], explanation: "" };
    case "matching":
      // Ліва колонка стоїть на місці, права перемішується.
      return { lead: "", images: [], pairs: [{ left: "", right: "" }, { left: "", right: "" }], explanation: "" };
    case "hotspot":
      // Зони — у ВІДСОТКАХ від розміру фото, не в пікселях: одне й те
      // саме фото показується на телефоні й на ноутбуці різного розміру,
      // піксельні координати там розійшлися б.
      return { kicker: "", lead: "", images: [], zones: [], explanation: "" };
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
