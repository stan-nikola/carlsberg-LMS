import { describe, expect, it } from "vitest";
import { PIN_FORMAT, PIN_LENGTH } from "./pin";

describe("PIN_FORMAT", () => {
  it("приймає рівно PIN_LENGTH цифр", () => {
    expect(PIN_FORMAT.test("0".repeat(PIN_LENGTH))).toBe(true);
    expect(PIN_FORMAT.test("123456")).toBe(true);
  });

  it("відкидає коротші, довші й нецифрові", () => {
    for (const pin of ["1234", "12345", "1234567", "12345a", "12 456", "", "123456\n"]) {
      expect(PIN_FORMAT.test(pin)).toBe(false);
    }
  });
});
