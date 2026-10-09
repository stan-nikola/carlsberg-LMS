import { cookies } from "next/headers";
import { UKRAINE_TZ } from "@/lib/ukraineTime";

/** Cookie з поясом пристрою — пише components/app/TimeZoneCookie.tsx. */
export const TZ_COOKIE = "tz";

/** Чи знає середовище такий IANA-пояс («Europe/Warsaw»). */
export function isValidTimeZone(zone: string | undefined | null): zone is string {
  if (!zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("uk-UA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Пояс, у якому сервер складає рядки з датами для ЦІЄЇ людини (план курсу,
 * список команди, звіт). Немає cookie чи пояс невідомий — український час.
 * Бізнес-правила від нього не залежать (lib/ukraineTime.ts).
 */
export async function viewerTimeZone(): Promise<string> {
  const value = (await cookies()).get(TZ_COOKIE)?.value;
  const zone = value ? decodeURIComponent(value) : null;
  return isValidTimeZone(zone) ? zone : UKRAINE_TZ;
}
