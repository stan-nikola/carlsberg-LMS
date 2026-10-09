import { kyivHour } from "@/lib/kyivTime";

/**
 * Привітання "Доброго ранку/дня/вечора" за годиною — обов'язково за
 * київським часом, а НЕ за таймзоною сервера. Це Server Component
 * (app/hub/page.js), new Date() там виконується на сервері: локально
 * машина розробника й так у Kyiv time, тому раніше `new Date().getHours()`
 * випадково давав правильну відповідь — але після деплою на Vercel
 * serverless-функції за замовчуванням працюють в UTC, і без явної
 * таймзони "Доброго ранку" могло б показуватись реальним вечором у Києві.
 * Усі співробітники — в Україні (Carlsberg Ukraine), тому таймзона тут
 * навмисно НЕ параметризована під користувача.
 */
export function getTimeBasedGreeting(date: Date = new Date()): string {
  const hour = kyivHour(date);
  if (hour < 12) return "Доброго ранку";
  if (hour < 18) return "Доброго дня";
  return "Доброго вечора";
}
