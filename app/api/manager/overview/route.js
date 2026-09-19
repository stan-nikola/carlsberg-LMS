import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier, getAllSubordinates } from "@/lib/permissions";
import { getTeamTree, getTeamSummary, getDashboardStats, getWeeklyTrend } from "@/lib/managerDashboard";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { getEmployeeRating, getTeamRating, getLeaderboard } from "@/lib/rating";
import { getEmployeeBadgesView, getEmployeeCertificates } from "@/lib/achievements";

// GET /api/manager/overview — початкове завантаження /manager одним
// round-trip: дерево команди, легкий підсумок по кожній людині (без
// історії спроб — та тягнеться окремо, лише при розкритті конкретної
// картки, див. /api/manager/employees/[id]), агрегати для KPI/графіків, і
// власні enrollments керівника ("Мої курси").
export async function GET(request) {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerTier(employee)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ВРЕМЕННО (аудит быстродействия, 2026-09-19): ?diagTiming=1 замеряет
  // 4 параллельных вызова /manager/achievements по отдельности — новый
  // отдельный роут для этого застрял в негативном edge-кэше Vercel
  // (стабильный 404 с Last-Modified от первого деплоя, не сбрасывался
  // повторным деплоем), поэтому используем уже задеплоенный путь. Убрать
  // после диагностики.
  if (new URL(request.url).searchParams.get("diagTiming")) {
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

  const [subordinateIds, tree, myEnrollments] = await Promise.all([
    getAllSubordinates(employee.id),
    getTeamTree(employee.id),
    getEmployeeEnrollments(employee.id),
  ]);

  const [summaryMap, stats, weeklyTrend] = await Promise.all([
    getTeamSummary(subordinateIds),
    getDashboardStats(subordinateIds),
    getWeeklyTrend(subordinateIds),
  ]);
  const [{ level }, rating] = await Promise.all([getEmployeeRating(employee), getTeamRating(employee)]);
  const levelLabel = level.label;

  return NextResponse.json({
    me: {
      id: employee.id,
      name: employee.name,
      externalCode: employee.externalCode,
      hasEmail: Boolean(employee.email),
      avatarUrl: employee.avatarUrl,
      levelLabel,
      position: employee.position,
      enrollments: myEnrollments,
    },
    team: {
      tree,
      // Map не серіалізується в JSON напряму — переганяємо в звичайний
      // об'єкт {employeeId: summary}, клієнт читає по id.
      summaryByEmployeeId: Object.fromEntries(summaryMap),
      stats,
      weeklyTrend,
      // Рейтинг: бали/% кожного підлеглого + середнє команди і місце серед
      // команд тієї ж посади (lib/rating.ts getTeamRating).
      rating,
    },
  });
}
