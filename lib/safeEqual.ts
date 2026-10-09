import { timingSafeEqual } from "node:crypto";

/**
 * Порівняння секретів (підписи cookie, паролі, PIN, заголовки webhook/cron)
 * за сталий час. Порожнє чи відсутнє значення з будь-якого боку — false:
 * незаданий секрет не повинен «збігатися» з порожнім заголовком.
 */
export function safeEqual(expected: string | null | undefined, provided: string | null | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
