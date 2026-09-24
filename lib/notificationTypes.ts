/**
 * Словник сповіщень — спільний для сервера (lib/notifications.js) і
 * клієнта (центр сповіщень, налаштування, service worker). Без залежностей
 * від prisma/React, щоб імпортуватись куди завгодно й тестуватись.
 *
 * Категорія — те, що людина вмикає/вимикає в налаштуваннях
 * (NotificationPreference). Тип — конкретна подія всередині категорії.
 */

export type NotificationCategoryKey = "courses" | "deadlines" | "badges" | "team" | "news";

export type NotificationCategoryMeta = {
  key: NotificationCategoryKey;
  label: string;
  hint: string;
  icon: string;
};

export const NOTIFICATION_CATEGORIES: NotificationCategoryMeta[] = [
  {
    key: "courses",
    label: "Нові курси",
    hint: "Вам призначено курс, відкрився наступний модуль",
    icon: "📘",
  },
  {
    key: "deadlines",
    label: "Дедлайни",
    hint: "Нагадування за 3 дні та за 1 день до терміну, прострочення, нагадування від керівника",
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

export const CATEGORY_KEYS: NotificationCategoryKey[] = NOTIFICATION_CATEGORIES.map((c) => c.key);

/** "courses" -> "telegramCourses" — назва поля NotificationPreference для
 *  Telegram-варіанта тієї самої категорії (профіль показує Push і
 *  Telegram як два незалежні розкривні списки з тими самими 5 рядками). */
export function telegramCategoryKey(categoryKey: string): string {
  return `telegram${categoryKey.charAt(0).toUpperCase()}${categoryKey.slice(1)}`;
}

export const TELEGRAM_CATEGORY_KEYS: string[] = CATEGORY_KEYS.map(telegramCategoryKey);

/** Тип події → категорія. Єдине місце, де це зіставлення записано. */
export const TYPE_CATEGORY: Record<string, NotificationCategoryKey> = {
  enrollment_assigned: "courses",
  module_unlocked: "courses",
  deadline_3d: "deadlines",
  deadline_1d: "deadlines",
  enrollment_overdue: "deadlines",
  manager_reminder: "deadlines",
  // Похвала за складений курс — про курс, не про дедлайн і не про
  // відзнаку-бейдж: людина, що вимкнула «Досягнення», її все одно отримає.
  manager_praise: "courses",
  badge_awarded: "badges",
  subordinate_enrollment_overdue: "team",
  team_digest: "team",
  broadcast: "news",
};

export function categoryOf(type: string): string {
  return TYPE_CATEGORY[type] || "system";
}

export function categoryMeta(key: string): NotificationCategoryMeta | { key: string; label: string; icon: string; hint: string } {
  return NOTIFICATION_CATEGORIES.find((c) => c.key === key) || { key, label: key, icon: "🔔", hint: "" };
}

/**
 * Посилання «для хаба» → відповідник у кабінеті керівника.
 *
 * Керівний шар (SV і вище) взагалі не бачить /hub: app/hub/layout.js
 * мовчки перекидає будь-який запит туди на ГОЛИЙ /manager, без розділу й
 * без query. Тому сповіщення з url `/hub/achievements?highlight=badge…`,
 * що прийшло керівнику, відкривало дашборд команди, а не відзнаку
 * (скарга користувача, 2026-09-23: «не переходить на ачивки з
 * колокольчика»). Шлях у layout недоступний (Server Component не бачить
 * pathname), middleware в проєкті немає — тож правильну адресу підставляє
 * той, хто СТВОРЮЄ сповіщення (lib/notifications.js notifyEmployees), і
 * дублює центр сповіщень для рядків, що вже лежать у базі.
 *
 * Невідомий /hub-шлях веде на /manager — краще дашборд, ніж редирект,
 * що з'їсть query. Усе, що не /hub (напр. /courses/<slug>), не чіпаємо:
 * плеєр курсу спільний для обох кабінетів.
 */
const HUB_TO_MANAGER: Record<string, string> = {
  "/hub": "/manager",
  "/hub/learn": "/manager/courses",
  "/hub/achievements": "/manager/achievements",
  "/hub/profile": "/manager/profile",
  "/hub/notifications": "/manager/notifications",
};

export function toManagerUrl(url: string | null | undefined): string | null {
  if (!url) return url ?? null;
  if (url !== "/hub" && !url.startsWith("/hub/") && !url.startsWith("/hub?")) return url;
  const queryAt = url.search(/[?#]/);
  const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
  const rest = queryAt === -1 ? "" : url.slice(queryAt);
  return `${HUB_TO_MANAGER[pathname] ?? "/manager"}${rest}`;
}

export type PreferenceValues = Record<string, boolean>;

/** Дефолти вподобань — усе увімкнено (рядка в БД може не бути). */
export const DEFAULT_PREFERENCES: PreferenceValues = Object.freeze({
  ...Object.fromEntries(CATEGORY_KEYS.map((k) => [k, true])),
  ...Object.fromEntries(TELEGRAM_CATEGORY_KEYS.map((k) => [k, true])),
});

/**
 * Чи хоче людина цю категорію. prefs — рядок NotificationPreference або
 * null; "system" (службові) не вимикається.
 */
export function wantsCategory(prefs: PreferenceValues | null | undefined, category: string): boolean {
  if (category === "system") return true;
  if (!CATEGORY_KEYS.includes(category as NotificationCategoryKey)) return true;
  if (!prefs) return DEFAULT_PREFERENCES[category];
  return prefs[category] !== false;
}

/** Той самий gate, що wantsCategory, але для незалежного Telegram-списку
 *  (lib/notifications.js: телеграм-адресати — підмножина тих, кому й так
 *  створюється Notification, додатково відфільтрована цим прапорцем). */
export function wantsTelegramCategory(prefs: PreferenceValues | null | undefined, category: string): boolean {
  if (category === "system") return true;
  if (!CATEGORY_KEYS.includes(category as NotificationCategoryKey)) return true;
  const key = telegramCategoryKey(category);
  if (!prefs) return DEFAULT_PREFERENCES[key];
  return prefs[key] !== false;
}

/**
 * Приводить довільний об'єкт із налаштувань (тіло PUT-запиту) до валідних
 * полів: лише відомі ключі, лише boolean. Невідоме — відкидається.
 */
export function sanitizePreferences(input: unknown): PreferenceValues {
  const out: PreferenceValues = {};
  const src = input as Record<string, unknown> | null | undefined;
  for (const key of [...CATEGORY_KEYS, ...TELEGRAM_CATEGORY_KEYS]) {
    if (typeof src?.[key] === "boolean") out[key] = src[key] as boolean;
  }
  return out;
}

/** Відносний час для списку («щойно», «5 хв тому», «вчора», дата). */
export function formatRelativeTime(date: string | number | Date, now: Date = new Date()): string {
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
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
