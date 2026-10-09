import { describe, it, expect, beforeEach } from "vitest";
import { openPin, sealPin } from "@/lib/pinCrypto";

describe("pinCrypto — PIN у базі зашифрований", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-for-pin";
  });

  it("зашифроване розшифровується назад, і в базі нема самого PIN", () => {
    const sealed = sealPin("048213");
    expect(sealed.startsWith("e1:")).toBe(true);
    expect(sealed).not.toContain("048213");
    expect(openPin(sealed)).toBe("048213");
  });

  it("той самий PIN щоразу шифрується інакше (випадковий IV)", () => {
    expect(sealPin("111111")).not.toBe(sealPin("111111"));
  });

  it("підроблене значення чи інший ключ → null, а не виняток", () => {
    const sealed = sealPin("123456");
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA");
    expect(openPin(tampered)).toBeNull();
    process.env.SESSION_SECRET = "another-secret";
    expect(openPin(sealed)).toBeNull();
  });

  it("PIN, виданий до шифрування (без префікса), повертається як є; порожнє → null", () => {
    expect(openPin("1234")).toBe("1234");
    expect(openPin(null)).toBeNull();
    expect(openPin("")).toBeNull();
  });
});
