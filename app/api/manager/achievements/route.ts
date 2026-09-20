import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";
import { getEmployeeBadgesView, getEmployeeCertificates } from "@/lib/achievements";
import { getEmployeeRating, getLeaderboard } from "@/lib/rating";

// GET /api/manager/achievements — той самий привід, що
// /api/manager/courses (клієнтське перемикання вкладок ManagerShell.jsx,
// аудит "вообще без скелетонов мгновенно", 2026-09-20).
export async function GET() {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerTier(employee)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [rating, badges, certificates, leaderboard] = await Promise.all([
    getEmployeeRating(employee),
    getEmployeeBadgesView(employee.id),
    getEmployeeCertificates(employee.id),
    getLeaderboard(employee, "region", 10),
  ]);

  return NextResponse.json({
    rating,
    badges,
    certificates,
    leaderboard,
    cohortLabel: employee.position ? `на посаді ${employee.position.code}` : "колег",
    currentEmployeeId: employee.id,
    hasEmail: Boolean(employee.email),
  });
}
