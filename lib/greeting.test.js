import { describe, it, expect } from "vitest";
import { getTimeBasedGreeting } from "@/lib/greeting";

// Головний контракт тут: привітання рахується за КИЇВСЬКОЮ годиною, не
// за годиною сервера. Це Server Component (app/hub/page.js), і new Date()
// там виконується на сервері — локально машина розробника й так у Kyiv
// time, тому голе `new Date().getHours()` випадково "працювало" в dev, але
// після деплою на Vercel (serverless-функції за замовчуванням в UTC) дало
// б неправильне привітання. Тест нижче бере конкретний момент, де UTC- і
// київська година розходяться (Kyiv = UTC+3 у вересні, DST), і фіксує, що
// результат рахується саме по Києву.
describe("getTimeBasedGreeting", () => {
  it("рахує за київським часом, а не за UTC/серверним — 21:30 UTC у вересні це вже 00:00 наступного дня в Києві", () => {
    const utcLateEvening = new Date("2026-09-09T21:30:00Z");
    // За UTC-годиною (21) вийшло б "Доброго вечора" — неправильно.
    // За київською (00) правильно "Доброго ранку".
    expect(getTimeBasedGreeting(utcLateEvening)).toBe("Доброго ранку");
  });

  it("Доброго ранку — до 12:00 за Києвом", () => {
    expect(getTimeBasedGreeting(new Date("2026-09-09T05:00:00+03:00"))).toBe("Доброго ранку");
    expect(getTimeBasedGreeting(new Date("2026-09-09T11:59:00+03:00"))).toBe("Доброго ранку");
  });

  it("Доброго дня — з 12:00 до 18:00 за Києвом", () => {
    expect(getTimeBasedGreeting(new Date("2026-09-09T12:00:00+03:00"))).toBe("Доброго дня");
    expect(getTimeBasedGreeting(new Date("2026-09-09T17:59:00+03:00"))).toBe("Доброго дня");
  });

  it("Доброго вечора — з 18:00 за Києвом", () => {
    expect(getTimeBasedGreeting(new Date("2026-09-09T18:00:00+03:00"))).toBe("Доброго вечора");
    expect(getTimeBasedGreeting(new Date("2026-09-09T23:30:00+03:00"))).toBe("Доброго вечора");
  });
});
