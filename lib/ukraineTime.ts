/**
 * Час БІЗНЕС-ПРАВИЛ — український (Europe/Kyiv, єдиний пояс країни): дедлайн —
 * кінець українського дня, щоденні розсилки о 9:00 за Україною, «раз на день».
 * Показ дат людині — у поясі її пристрою (lib/localDate.ts, components/ui/LocalDate.tsx).
 * Сервер (Vercel) живе в UTC, і до цього модуля:
 *  - дедлайн «1 жовтня» з форми адміна ставав 03:00 за українським часом 1 жовтня, і
 *    cron о 06:00 за українським часом позначав курс простроченим У САМ день дедлайну;
 *  - дати, відформатовані на сервері (сертифікат, «модуль відкриється …»,
 *    повідомлення про прострочення), для подій 00:00–03:00 за українським часом
 *    показували ПОПЕРЕДНІЙ день;
 *  - «раз на день» для нагадувань керівника рахувався за днем UTC.
 */
export const UKRAINE_TZ = "Europe/Kyiv";

/** Мілісекунд у добі (для різниці дат; календарні дні за українським часом — ukraineDayKey/endOfUkraineDay). */
export const DAY_MS = 86_400_000;

type DateLike = Date | string | number;

function parts(date: DateLike) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: UKRAINE_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, d] = fmt.format(new Date(date)).split("-").map(Number);
  return { y, m, d };
}

/** Зсув українського часу від UTC у хвилинах для цього моменту (+120 взимку, +180 влітку). */
function ukraineOffsetMinutes(date: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: UKRAINE_TZ, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/** Година за українським часом (0–23) — для щоденного cron «о 9:00 за українським часом» незалежно від літнього/зимового часу. */
export function ukraineHour(date: DateLike = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: UKRAINE_TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date(date)));
}

/** «2026-10-01» — календарний день за українським часом (ключі «раз на день»). */
export function ukraineDayKey(date: DateLike = new Date()): string {
  const { y, m, d } = parts(date);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Кінець календарного дня за українським часом (23:59:59.999), у якому лежить `date`. */
export function endOfUkraineDay(date: DateLike): Date {
  const { y, m, d } = parts(date);
  // Зсув — на полудень того ж дня: перехід на літній/зимовий час буває вночі,
  // тож о 12:00 і о 23:59 він однаковий.
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - ukraineOffsetMinutes(noonUtc) * 60_000);
}

/** Дедлайн «через N днів»: кінець українського дня, а не та сама хвилина через N×24 год. */
export function deadlineAfterDays(from: DateLike, days: number): Date {
  const { y, m, d } = parts(from);
  return endOfUkraineDay(new Date(Date.UTC(y, m - 1, d + days, 12)));
}

/** Дата з форми («2026-10-01») → кінець цього дня за українським часом. */
export function endOfUkraineDayFromInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return endOfUkraineDay(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)));
}

/** «01.10.2026» за українським часом — для тексту, який фіксує сервер (PDF-сертифікат,
 *  Excel, листи й сповіщення). На екрані — lib/localDate.ts. */
export function formatUkraineDate(date: DateLike): string {
  return new Date(date).toLocaleDateString("uk-UA", { timeZone: UKRAINE_TZ });
}
