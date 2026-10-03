import { beforeAll, describe, expect, it } from "vitest";
import { EXPORT_LINK_TTL_MS, signExportToken, verifyExportToken } from "./exportLink";

beforeAll(() => {
  process.env.SESSION_SECRET ||= "test-secret";
});

describe("export link token", () => {
  it("підписаний ключ читається назад", () => {
    expect(verifyExportToken(signExportToken(42, 3, 1_000), 2_000)).toEqual({ employeeId: 42, sessionVersion: 3 });
  });

  it("прострочений, підроблений чи сміття — null", () => {
    const t = signExportToken(42, 3, 1_000);
    expect(verifyExportToken(t, 1_000 + EXPORT_LINK_TTL_MS + 1)).toBeNull();
    expect(verifyExportToken(t.replace(/^42\./, "43."), 2_000)).toBeNull();
    expect(verifyExportToken(`${t}x`, 2_000)).toBeNull();
    for (const bad of [undefined, "", "a.b.c", 42]) expect(verifyExportToken(bad, 2_000)).toBeNull();
  });
});
