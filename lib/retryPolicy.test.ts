import { describe, expect, it } from "vitest";
import { formatWait, pickQuestionPool, resolveRetryRules, retryGate } from "./retryPolicy";

const NOW = new Date("2026-09-17T12:00:00Z");

function failed(over: { attemptCount?: number; completedAt?: Date } = {}) {
  return { passed: false, completedAt: over.completedAt ?? NOW, attemptCount: over.attemptCount ?? 1 };
}

describe("resolveRetryRules — курс і перевизначення модулем", () => {
  it("без налаштувань правил немає", () => {
    expect(resolveRetryRules(null, null)).toEqual({ freeAttempts: null, cooldownHours: null });
  });

  it("беруться з курсу, коли в модуля нічого не задано", () => {
    const r = resolveRetryRules({ retryFreeAttempts: 2, retryCooldownHours: 1 }, { retryFreeAttempts: null, retryCooldownHours: null });
    expect(r).toEqual({ freeAttempts: 2, cooldownHours: 1 });
  });

  it("модуль перекриває курс", () => {
    const r = resolveRetryRules({ retryFreeAttempts: 2, retryCooldownHours: 1 }, { retryFreeAttempts: 5, retryCooldownHours: 24 });
    expect(r).toEqual({ freeAttempts: 5, cooldownHours: 24 });
  });

  it("нуль у модуля — це усвідомлений нуль, а не «успадкувати»", () => {
    const r = resolveRetryRules({ retryFreeAttempts: 3, retryCooldownHours: 2 }, { retryFreeAttempts: 0, retryCooldownHours: 0 });
    expect(r).toEqual({ freeAttempts: 0, cooldownHours: 0 });
  });
});

describe("retryGate — м'яке гальмо", () => {
  const RULES = { freeAttempts: 2, cooldownHours: 1 };

  it("модуль ще не проходили — гальма немає", () => {
    const g = retryGate(null, RULES, NOW);
    expect(g.canRetryNow).toBe(true);
    expect(g.attemptsMade).toBe(0);
  });

  it("складений модуль гальмо не чіпає", () => {
    const g = retryGate({ passed: true, completedAt: NOW, attemptCount: 9 }, RULES, NOW);
    expect(g.canRetryNow).toBe(true);
  });

  it("після першої невдалої спроби лишається ще одна вільна", () => {
    const g = retryGate(failed({ attemptCount: 1 }), RULES, NOW);
    expect(g.canRetryNow).toBe(true);
    expect(g.attemptsLeft).toBe(1);
    expect(g.nextAttemptAt).toBeNull();
  });

  it("вільні спроби вичерпано — пауза, з датою наступної спроби", () => {
    const g = retryGate(failed({ attemptCount: 2 }), RULES, NOW);
    expect(g.canRetryNow).toBe(false);
    expect(g.attemptsLeft).toBe(0);
    expect(g.nextAttemptAt).toEqual(new Date("2026-09-17T13:00:00Z"));
  });

  it("пауза минула — спроба знову відкрита", () => {
    const g = retryGate(failed({ attemptCount: 2, completedAt: new Date("2026-09-17T10:00:00Z") }), RULES, NOW);
    expect(g.canRetryNow).toBe(true);
    expect(g.nextAttemptAt).toBeNull();
  });

  it("без обмеження спроб повтор завжди відкритий", () => {
    const g = retryGate(failed({ attemptCount: 99 }), { freeAttempts: null, cooldownHours: 24 }, NOW);
    expect(g.canRetryNow).toBe(true);
    expect(g.attemptsLeft).toBeNull();
  });

  it("обмеження спроб без паузи нічого не блокує", () => {
    const g = retryGate(failed({ attemptCount: 5 }), { freeAttempts: 2, cooldownHours: null }, NOW);
    expect(g.canRetryNow).toBe(true);
    expect(g.attemptsLeft).toBe(0);
  });
});

describe("formatWait", () => {
  it("менше години — у хвилинах", () => {
    expect(formatWait(new Date("2026-09-17T12:25:00Z"), NOW)).toBe("25 хв");
  });
  it("більше години — години й хвилини", () => {
    expect(formatWait(new Date("2026-09-17T14:15:00Z"), NOW)).toBe("2 год 15 хв");
  });
  it("рівні години — без хвилин", () => {
    expect(formatWait(new Date("2026-09-17T15:00:00Z"), NOW)).toBe("3 год");
  });
});

describe("pickQuestionPool", () => {
  const ids = [1, 2, 3, 4, 5];

  it("без розміру пулу показуються всі питання", () => {
    expect(pickQuestionPool(ids, null)).toEqual(new Set(ids));
  });

  it("пул більший або рівний кількості питань — теж усі", () => {
    expect(pickQuestionPool(ids, 5)).toEqual(new Set(ids));
    expect(pickQuestionPool(ids, 9)).toEqual(new Set(ids));
  });

  it("обирає рівно стільки питань, скільки просили, без повторів", () => {
    const picked = pickQuestionPool(ids, 3, () => 0.5);
    expect(picked.size).toBe(3);
    expect([...picked].every((id) => ids.includes(id))).toBe(true);
  });

  it("детермінований генератор дає передбачувану вибірку", () => {
    // rand()=0 щоразу бере перший елемент залишку.
    expect(pickQuestionPool(ids, 2, () => 0)).toEqual(new Set([1, 2]));
  });

  it("порожній модуль не ламається", () => {
    expect(pickQuestionPool([], 3)).toEqual(new Set());
  });
});
