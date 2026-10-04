import { describe, expect, it, vi } from "vitest";
import { describeAuditEntry } from "./auditFormat";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { parseAuditFilters } = await import("./auditQuery");

describe("describeAuditEntry", () => {
  it("розповідає результат модуля словами", () => {
    expect(
      describeAuditEntry({
        actor: "employee",
        action: "learning.module_complete",
        details: { module: "Модуль 1", course: "Механіка 15", scorePercent: 80, passed: true, attempt: 2 },
      })
    ).toBe("Модуль «Модуль 1» курсу «Механіка 15»: 80% — складено, спроба 2");
  });

  it("невдалий вхід — причина людською мовою", () => {
    expect(describeAuditEntry({ actor: "employee", action: "auth.login_failed", details: { reason: "invalid_pin" } })).toBe("Вхід не вдався: невірний PIN");
  });
});

describe("parseAuditFilters", () => {
  it("бере лише відомі значення", () => {
    expect(parseAuditFilters(new URLSearchParams("actor=manager&category=learning&q= Петро &employeeId=12"))).toEqual({
      actor: "manager",
      category: "learning",
      q: "Петро",
      employeeId: 12,
    });
    expect(parseAuditFilters(new URLSearchParams("actor=root&category=x&employeeId=-1"))).toEqual({});
  });
});
