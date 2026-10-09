import { describe, expect, it } from "vitest";
import { isClass } from "./cssClass";

describe("isClass", () => {
  it("snake_case стану → kebab-case класу", () => {
    expect(isClass("in_progress")).toBe("is-in-progress");
    expect(isClass("not_started")).toBe("is-not-started");
    expect(isClass("overdue")).toBe("is-overdue");
  });
  it("порожнє значення — без класу", () => {
    expect(isClass(null)).toBe("");
    expect(isClass(undefined)).toBe("");
  });
});
