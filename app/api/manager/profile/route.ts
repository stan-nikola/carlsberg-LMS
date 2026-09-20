import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";
import { getEmployeeRating } from "@/lib/rating";

// GET /api/manager/profile — той самий привід, що /api/manager/courses
// (клієнтське перемикання вкладок ManagerShell.jsx, аудит "вообще без
// скелетонов мгновенно", 2026-09-20).
export async function GET() {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerTier(employee)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { level } = await getEmployeeRating(employee);
  return NextResponse.json({
    dbName: employee.name,
    hasEmail: Boolean(employee.email),
    externalCode: employee.externalCode,
    levelLabel: level.label,
    avatarUrl: employee.avatarUrl,
    managerEmail: employee.manager?.email ?? null,
    firstLoginAt: employee.firstLoginAt,
  });
}
