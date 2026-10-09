import { UKRAINE_TZ } from "@/lib/ukraineTime";

// Показ дат людині — у часовому поясі її пристрою (рішення користувача
// 2026-10-09): хто відкрив застосунок за кордоном, бачить свій час. Бізнес-
// правила (дедлайн — кінець дня, розсилки о 9:00) рахуються за українським
// часом у lib/ukraineTime.ts. На сервері пристрою не видно — там український
// пояс; у розмітці, що рендериться на сервері, дату показує
// components/ui/LocalDate.tsx (без розбіжності гідратації).

type DateLike = Date | string | number;

/** Пояс показу: пристрою в браузері, український на сервері. */
export const displayZone = (): string | undefined => (typeof window === "undefined" ? UKRAINE_TZ : undefined);

/** «09.10.2026» (або інший формат через options) у поясі показу. */
export function formatDate(date: DateLike, options: Intl.DateTimeFormatOptions = {}, zone = displayZone()): string {
  return new Date(date).toLocaleDateString("uk-UA", { ...options, timeZone: zone });
}

/** Дата й час у поясі показу. */
export function formatDateTime(date: DateLike, options: Intl.DateTimeFormatOptions = {}, zone = displayZone()): string {
  return new Date(date).toLocaleString("uk-UA", { ...options, timeZone: zone });
}

/** Лише час у поясі показу. */
export function formatTime(date: DateLike, options: Intl.DateTimeFormatOptions = {}, zone = displayZone()): string {
  return new Date(date).toLocaleTimeString("uk-UA", { ...options, timeZone: zone });
}

/** «Доброго ранку/дня/вечора» за годиною (0–23). */
export function greetingForHour(hour: number): string {
  if (hour < 12) return "Доброго ранку";
  if (hour < 18) return "Доброго дня";
  return "Доброго вечора";
}
