/**
 * Час бізнесу — Київ (2026-09-27, аудит логіки L-9). Сервер (Vercel) живе в
 * UTC, і до цього:
 *  - дедлайн «1 жовтня» з форми адміна ставав 03:00 за Києвом 1 жовтня, і
 *    cron о 06:00 за Києвом позначав курс простроченим У САМ день дедлайну;
 *  - дати, відформатовані на сервері (сертифікат, «модуль відкриється …»,
 *    повідомлення про прострочення), для подій 00:00–03:00 за Києвом
 *    показували ПОПЕРЕДНІЙ день;
 *  - «раз на день» для нагадувань керівника рахувався за днем UTC.
 */
export const KYIV_TZ = "Europe/Kyiv";

type DateLike = Date | string | number;

function parts(date: DateLike) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: KYIV_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  const [y, m, d] = fmt.format(new Date(date)).split("-").map(Number);
  return { y, m, d };
}

/** Зсув Києва від UTC у хвилинах для цього моменту (+120 взимку, +180 влітку). */
function kyivOffsetMinutes(date: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: KYIV_TZ, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value;
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/** Година за Києвом (0–23) — для щоденного cron «о 9:00 за Києвом» незалежно від літнього/зимового часу. */
export function kyivHour(date: DateLike = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: KYIV_TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date(date)));
}

/** «2026-10-01» — календарний день за Києвом (ключі «раз на день»). */
export function kyivDayKey(date: DateLike = new Date()): string {
  const { y, m, d } = parts(date);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Кінець календарного дня за Києвом (23:59:59.999), у якому лежить `date`. */
export function endOfKyivDay(date: DateLike): Date {
  const { y, m, d } = parts(date);
  // Зсув — на полудень того ж дня: перехід на літній/зимовий час буває вночі,
  // тож о 12:00 і о 23:59 він однаковий.
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - kyivOffsetMinutes(noonUtc) * 60_000);
}

/** Дедлайн «через N днів»: кінець київського дня, а не та сама хвилина через N×24 год. */
export function deadlineAfterDays(from: DateLike, days: number): Date {
  const { y, m, d } = parts(from);
  return endOfKyivDay(new Date(Date.UTC(y, m - 1, d + days, 12)));
}

/** Дата з форми («2026-10-01») → кінець цього дня за Києвом. */
export function endOfKyivDayFromInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return endOfKyivDay(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)));
}

/** «01.10.2026» за Києвом — для всіх дат, що форматуються на сервері. */
export function formatKyivDate(date: DateLike): string {
  return new Date(date).toLocaleDateString("uk-UA", { timeZone: KYIV_TZ });
}
