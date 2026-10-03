import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { normalizeExternalCode, pinThrottleKey } = await import("./loginThrottle");

describe("normalizeExternalCode", () => {
  it("пропускає реальні коди й обрізає пробіли", () => {
    expect(normalizeExternalCode(" SR0106 ")).toBe("SR0106");
    expect(normalizeExternalCode("ml03005")).toBe("ml03005");
  });

  it("відкидає символи шаблону ILIKE, порожнє, задовге й не-рядок", () => {
    for (const bad of ["%", "SR01_6", "S%0106", "SYSTEM-ADMIN", "", "A".repeat(33), 123, null, { equals: "x" }]) {
      expect(normalizeExternalCode(bad)).toBeNull();
    }
  });

  it("регістр не дає окремого лічильника спроб", () => {
    expect(pinThrottleKey("SR0106")).toBe(pinThrottleKey("sr0106"));
  });
});
