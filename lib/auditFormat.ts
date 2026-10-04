/**
 * Підписи й «розбір» записів журналу дій (AuditLog) — одне джерело для екрана
 * /admin/audit (components/AdminAudit.tsx) і Excel-вивантаження
 * (app/api/admin/audit/export): інакше текст у файлі й на екрані розійдеться.
 * Нова дія = рядок в AUDIT_ACTION_LABELS (+ гілка в describeAuditEntry, якщо
 * деталі варто розказати словами).
 */
export type AuditEntryLike = { actor: string; action: string; details: Record<string, unknown> | null };

export const AUDIT_ROLE_LABELS: Record<string, string> = {
  super: "Супер-адмін",
  admin: "Адмін",
  manager: "Керівник",
  employee: "Співробітник",
  system: "Система",
};

export const AUDIT_CATEGORIES: Record<string, string> = {
  auth: "Входи",
  learning: "Навчання",
  manager: "Дії керівників",
  profile: "Профіль і сповіщення",
  activity: "Активність",
  admin: "Адмінка",
  system: "Система",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  // входи
  "auth.pin_requested": "Запит PIN",
  "auth.login": "Вхід",
  "auth.login_failed": "Невдалий вхід",
  "auth.logout": "Вихід",
  "admin.login": "Вхід в адмінку",
  "admin.login_failed": "Невдалий вхід в адмінку",
  "admin.logout": "Вихід з адмінки",
  // навчання
  "learning.course_start": "Почав курс",
  "learning.module_complete": "Пройшов модуль",
  "learning.course_complete": "Завершив курс",
  "learning.certificate": "Завантажив сертифікат",
  // керівники
  "manager.remind": "Нагадування команді",
  "manager.export": "Excel-звіт по команді",
  // профіль і сповіщення
  "profile.avatar_update": "Змінив фото профілю",
  "profile.avatar_delete": "Прибрав фото профілю",
  "profile.notifications_update": "Налаштування сповіщень",
  "profile.telegram_link": "Підключив Telegram",
  "profile.telegram_unlink": "Відключив Telegram",
  "profile.push_subscribe": "Увімкнув push",
  "profile.push_unsubscribe": "Вимкнув push",
  "activity.visit": "Був у застосунку",
  "system.cron": "Щоденні фонові задачі",
  "audit.retention": "Термін зберігання журналу",
  "audit.export": "Вивантаження журналу в Excel",
  // адмінка
  "enrollment.update": "Корекція проходження",
  "enrollment.delete": "Знято призначення",
  "employee.update": "Зміна картки співробітника",
  "employee.create": "Створено співробітника",
  "employee.import": "Імпорт співробітників",
  "badge.award": "Видано відзнаку",
  "badge.award_bulk": "Масова видача відзнаки",
  "badge.revoke": "Відкликано відзнаку",
  "badge.delete": "Видалено тип відзнаки",
  "pin.reset": "Скинуто PIN",
  "course.assign": "Призначено курс",
  "course.delete": "Видалено курс",
  "course.unassign_all": "Знято всі призначення курсу",
  "rating.rules.update": "Змінено ваги рейтингу",
  "rating.recalculate": "Перерахунок рейтингу",
  "token.create": "Створено Excel-токен",
  "token.revoke": "Відкликано Excel-токен",
  "badge.create": "Створено тип відзнаки",
  "badge.update": "Змінено тип відзнаки",
  "course.create": "Створено курс",
  "course.update": "Змінено налаштування курсу",
  "module.create": "Додано модуль",
  "module.delete": "Видалено модуль",
  "folder.create": "Створено папку курсів",
  "folder.delete": "Видалено папку курсів",
  "broadcast.send": "Ручна розсилка",
  "broadcast.delete": "Видалено розсилку",
  "design.save": "Збережено дизайн-токени для всіх",
  "design.reset": "Скинуто дизайн-токени до дефолтів",
  "telegram.webhook": "Увімкнено Telegram webhook",
  "telegram.menu_button": "Увімкнено кнопку меню Mini App",
  "telegram.unlink": "Відключено Telegram",
  "telegram.test": "Тест у Telegram",
};

const LOGIN_FAIL: Record<string, string> = {
  invalid_pin: "невірний PIN",
  pin_expired: "PIN прострочений",
  deactivated: "обліковий запис деактивовано",
};

const KEY_LABELS: Record<string, string> = {
  title: "назва",
  name: "ім'я",
  note: "примітка",
  count: "кількість",
  awardedCount: "видано",
  skippedCount: "пропущено",
  createdCount: "створено",
  assignedCount: "призначено",
  removed: "прибрано",
  scorePercent: "бал",
  status: "статус",
  passed: "складено",
  points: "бали",
  adminNote: "коментар адміна",
  from: "було",
  to: "стало",
};

const s = (v: unknown) => (v == null ? "" : String(v));
const yesNo = (v: unknown) => (v === true ? "так" : v === false ? "ні" : s(v));

/** Розбір запису людською мовою: що саме сталось, з тими цифрами, що є в деталях. */
export function describeAuditEntry(e: AuditEntryLike): string {
  const d = e.details || {};
  switch (e.action) {
    case "auth.pin_requested":
      return d.demo ? "PIN надіслано на пошту з тестового входу" : "PIN надіслано на пошту керівника";
    case "auth.login":
      return "Підтвердив PIN і увійшов";
    case "auth.login_failed":
      return `Вхід не вдався: ${LOGIN_FAIL[s(d.reason)] || s(d.reason)}`;
    case "auth.logout":
      return "Вийшов із застосунку";
    case "admin.login":
      return e.actor === "super" ? "Увійшов паролем супер-адміна" : "Увійшов паролем адміна";
    case "admin.login_failed":
      return "Невірний пароль адмінки";
    case "admin.logout":
      return "Вийшов з адмінки";
    case "learning.course_start":
      return "Перша відповідь у курсі — курс перейшов у «в процесі»";
    case "learning.module_complete":
      return `Модуль «${s(d.module)}» курсу «${s(d.course)}»: ${s(d.scorePercent)}% — ${d.passed ? "складено" : "не складено"}, спроба ${s(d.attempt)}`;
    case "learning.course_complete":
      return `Курс «${s(d.course)}»: ${s(d.scorePercent)}% — ${d.passed ? "складено" : "не складено"}${d.first ? "" : " (перескладання)"}`;
    case "learning.certificate":
      return `Сертифікат PDF (${s(d.scorePercent)}%)`;
    case "manager.remind":
      return d.via === "telegram"
        ? `Нагадування з Mini App${d.course ? ` про «${s(d.course)}»` : ""}`
        : `Нагадування ${s(d.recipients)} людям${d.message ? `: «${s(d.message)}»` : ""}`;
    case "manager.export":
      return `Звіт, аркушів: ${s(d.cards)}`;
    case "profile.notifications_update":
      return Object.entries(d)
        .map(([k, v]) => `${k}: ${v ? "увімк." : "вимк."}`)
        .join(", ");
    case "profile.telegram_unlink":
      return d.via === "/stop" ? "Командою /stop у боті" : "З профілю";
    case "activity.visit":
      return "Відкривав застосунок (фіксується не частіше разу на годину)";
    case "system.cron": {
      const r = d as Record<string, Record<string, unknown>>;
      return [
        r.overdue && `прострочено ${s(r.overdue.markedCount)}`,
        r.reminders && `нагадувань ${s(r.reminders.created)}`,
        r.badges && `відзнак ${s(r.badges.awardedCount)}`,
        r.digests && `дайджестів ${s(r.digests.created)}`,
        r.auditPurge && `прибрано з журналу ${s(r.auditPurge.removed)}`,
      ]
        .filter(Boolean)
        .join(", ");
    }
    case "audit.export":
      return `Рядків: ${s(d.rows)}${d.filters && Object.keys(d.filters).length ? ` · фільтри: ${Object.entries(d.filters as Record<string, unknown>).map(([k, v]) => `${k}=${s(v)}`).join(", ")}` : ""}`;
    case "audit.retention":
      return `${s(d.from)} → ${s(d.to)} днів`;
    default:
      return Object.entries(d)
        .filter(([, v]) => v != null && v !== "" && typeof v !== "object")
        .map(([k, v]) => `${KEY_LABELS[k] || k}: ${typeof v === "boolean" ? yesNo(v) : s(v)}`)
        .join(" · ");
  }
}
