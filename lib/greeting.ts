import { ukraineHour } from "@/lib/ukraineTime";
import { greetingForHour } from "@/lib/localDate";

/**
 * Привітання "Доброго ранку/дня/вечора" за годиною — обов'язково за
 * українським часом, а НЕ за таймзоною сервера. Це Server Component
 * (app/hub/page.js), new Date() там виконується на сервері: локально
 * машина розробника й так у Kyiv time, тому раніше `new Date().getHours()`
 * випадково давав правильну відповідь — але після деплою на Vercel
 * serverless-функції за замовчуванням працюють в UTC, і без явної
 * таймзони "Доброго ранку" могло б показуватись реальним вечором в Україні.
 * Це серверне значення; у браузері GreetingHeading перемикає привітання на
 * годину пристрою (хто відкрив застосунок за кордоном — бачить своє).
 */
export function getTimeBasedGreeting(date: Date = new Date()): string {
  return greetingForHour(ukraineHour(date));
}
