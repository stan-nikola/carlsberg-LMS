"use client";

import { useSyncExternalStore } from "react";
import { UKRAINE_TZ } from "@/lib/ukraineTime";
import { formatDate, formatDateTime, formatTime } from "@/lib/localDate";

type DateLike = Date | string | number;

const subscribe = () => () => {};

/**
 * Значення, що залежить від поясу пристрою. Сервер і перша гідратація беруть
 * серверне (український пояс) — розмітка збігається; одразу після гідратації
 * React бере клієнтське (пояс пристрою). Для людей в Україні це один і той
 * самий текст.
 */
export function useDeviceValue<T>(client: () => T, server: () => T): T {
  return useSyncExternalStore(subscribe, client, server);
}

/** Дата (або дата з часом) у поясі пристрою — для розмітки, що рендериться на сервері. */
export function LocalDate({
  value,
  kind = "date",
  options,
}: {
  value: DateLike;
  kind?: "date" | "datetime" | "time";
  options?: Intl.DateTimeFormatOptions;
}) {
  const format = kind === "datetime" ? formatDateTime : kind === "time" ? formatTime : formatDate;
  const text = useDeviceValue(
    () => format(value, options, undefined),
    () => format(value, options, UKRAINE_TZ),
  );
  return <>{text}</>;
}
