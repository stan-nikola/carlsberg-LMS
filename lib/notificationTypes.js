/**
 * Словник сповіщень — спільний для сервера (lib/notifications.js) і
 * клієнта (центр сповіщень, налаштування, service worker). Без залежностей
 * від prisma/React, щоб імпортуватись куди завгодно й тестуватись.
 *
 * Категорія — те, що людина вмикає/вимикає в налаштуваннях
 * (NotificationPreference). Тип — конкретна подія всередині категорії.
 */

export const NOTIFICATION_CATEGORIES = [
  {
    key: "courses",
    label: "Нові курси",
    hint: "Вам призначено курс, відкрився наступний модуль",
    icon: "📘",
  },
  {
    key: "deadlines",
    label: "Дедлайни",
    hint: "Нагадування за 3 дні та за 1 день до терміну, прострочення",
    icon: "⏰",
  },
  {
    key: "badges",
    label: "Відзнаки",
    hint: "Автоматичні відзнаки та винагороди від керівника",
    icon: "🏅",
  },
  {
    key: "team",
    label: "Команда",
    hint: "Для керівників: щоденний підсумок по підлеглих",
    icon: "👥",
  },
  {
    key: "news",
    label: "Новини платформи",
    hint: "Оголошення від адміністратора",
    icon: "📣",
  },
];

export const CATEGORY_KEYS = NOTIFICATION_CATEGORIES.map((c) => c.key);

/** Тип події → категорія. Єдине місце, де це зіставлення записано. */
export const TYPE_CATEGORY = {
  enrollment_assigned: "courses",
  module_unlocked: "courses",
  deadline_3d: "deadlines",
  deadline_1d: "deadlines",
  enrollment_overdue: "deadlines",
  badge_awarded: "badges",
  subordinate_enrollment_overdue: "team",
  team_digest: "team",
  broadcast: "news",
};

export function categoryOf(type) {
  return TYPE_CATEGORY[type] || "system";
}

export function categoryMeta(key) {
  return NOTIFICATION_CATEGORIES.find((c) => c.key === key) || { key, label: key, icon: "🔔", hint: "" };
}

/** Дефолти вподобань — усе увімкнено (рядка в БД може не бути). */
export const DEFAULT_PREFERENCES = Object.freeze(
  Object.fromEntries(CATEGORY_KEYS.map((k) => [k, true]))
);

/**
 * Чи хоче людина цю категорію. prefs — рядок NotificationPreference або
 * null; "system" (службові) не вимикається.
 */
export function wantsCategory(prefs, category) {
  if (category === "system") return true;
  if (!CATEGORY_KEYS.includes(category)) return true;
  if (!prefs) return DEFAULT_PREFERENCES[category];
  return prefs[category] !== false;
}

/**
 * Приводить довільний об'єкт із налаштувань (тіло PUT-запиту) до валідних
 * полів: лише відомі ключі, лише boolean. Невідоме — відкидається.
 */
export function sanitizePreferences(input) {
  const out = {};
  for (const key of CATEGORY_KEYS) {
    if (typeof input?.[key] === "boolean") out[key] = input[key];
  }
  return out;
}

/** Відносний час для списку («щойно», «5 хв тому», «вчора», дата). */
export function formatRelativeTime(date, now = new Date()) {
  const d = new Date(date);
  const diffMs = now - d;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "щойно";
  if (min < 60) return `${min} хв тому`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} год тому`;
  const days = Math.round(h / 24);
  if (days === 1) return "вчора";
  if (days < 7) return `${days} дн. тому`;
  return d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}
