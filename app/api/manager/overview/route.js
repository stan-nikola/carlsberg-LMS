import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier, getAllSubordinates } from "@/lib/permissions";
import { getTeamTree, getTeamSummary, getDashboardStats, getWeeklyTrend } from "@/lib/managerDashboard";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { computeXp } from "@/lib/progress";

// GET /api/manager/overview — початкове завантаження /manager одним
// round-trip: дерево команди, легкий підсумок по кожній людині (без
// історії спроб — та тягнеться окремо, лише при розкритті конкретної
// картки, див. /api/manager/employees/[id]), агрегати для KPI/графіків, і
// власні enrollments керівника ("Мої курси").
export async function GET() {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerTier(employee)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
  const { levelLabel } = computeXp(myEnrollments);

  return NextResponse.json({
    me: {
      id: employee.id,
      name: employee.name,
      externalCode: employee.externalCode,
      hasEmail: Boolean(employee.email),
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
    },
  });
}
