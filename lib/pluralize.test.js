import { describe, it, expect } from "vitest";
import { pluralize } from "@/lib/pluralize";

describe("pluralize", () => {
  it("форма 'one' — 1, 21, 31 (але не 11)", () => {
    expect(pluralize(1, "екран", "екрани", "екранів")).toBe("1 екран");
    expect(pluralize(21, "екран", "екрани", "екранів")).toBe("21 екран");
    expect(pluralize(31, "екран", "екрани", "екранів")).toBe("31 екран");
  });

  it("форма 'few' — 2-4, 22-24 (але не 12-14)", () => {
    expect(pluralize(2, "екран", "екрани", "екранів")).toBe("2 екрани");
    expect(pluralize(4, "екран", "екрани", "екранів")).toBe("4 екрани");
    expect(pluralize(23, "екран", "екрани", "екранів")).toBe("23 екрани");
  });

  it("форма 'many' — 0, 5-20, 11-14 навіть коли останні цифри виглядають як 'one'/'few'", () => {
    expect(pluralize(0, "екран", "екрани", "екранів")).toBe("0 екранів");
    expect(pluralize(5, "екран", "екрани", "екранів")).toBe("5 екранів");
    expect(pluralize(11, "екран", "екрани", "екранів")).toBe("11 екранів");
    expect(pluralize(12, "екран", "екрани", "екранів")).toBe("12 екранів");
    expect(pluralize(14, "екран", "екрани", "екранів")).toBe("14 екранів");
  });
});
