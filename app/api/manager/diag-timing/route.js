import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEmployeeRating, getLeaderboard } from "@/lib/rating";
import { getEmployeeBadgesView, getEmployeeCertificates } from "@/lib/achievements";

// ВРЕМЕННЫЙ диагностический роут (аудит быстродействия, 2026-09-19) —
// замеряет каждый из 4 параллельных вызовов /manager/achievements по
// отдельности, чтобы понять, какой именно не берётся из unstable_cache
// при повторных запросах. Удалить после диагностики.
export async function GET() {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  async function timed(label, fn) {
    const t0 = performance.now();
    await fn();
    return { label, ms: Math.round(performance.now() - t0) };
  }

  const results = [];
  results.push(await timed("rating", () => getEmployeeRating(employee)));
  results.push(await timed("badges", () => getEmployeeBadgesView(employee.id)));
  results.push(await timed("certificates", () => getEmployeeCertificates(employee.id)));
  results.push(await timed("leaderboard-region", () => getLeaderboard(employee, "region", 10)));

  return NextResponse.json({ employeeId: employee.id, results });
}
