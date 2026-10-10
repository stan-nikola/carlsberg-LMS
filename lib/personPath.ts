/**
 * Адреса сторінки людини в кабінеті керівника — за кодом співробітника
 * (`/manager/team/SR0016`), не за внутрішнім id (рішення користувача,
 * 2026-10-10: у рядку стану браузера й у сповіщеннях видно зрозумілий код).
 * Без коду — за id; сторінка приймає обидва й старий числовий id переводить
 * на код (посилання зі сповіщень, створених раніше).
 */
export function personHref(person: { id: number; externalCode?: string | null }, course?: string | null): string {
  const key = person.externalCode ? encodeURIComponent(person.externalCode) : String(person.id);
  return `/manager/team/${key}${course ? `?course=${encodeURIComponent(course)}` : ""}`;
}

/** Сегмент після `/team/` (код або старий числовий id); інша адреса — null. */
export function personKeyOf(url: string | null | undefined): string | null {
  const m = url?.match(/^\/(?:manager|hub)\/team\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
