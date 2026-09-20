import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { sortByUrgency } from "@/lib/progress";

// GET /api/manager/courses — дані для клієнтського перемикання вкладок
// ManagerShell.jsx (аудит "вообще без скелетонов мгновенно", 2026-09-20):
// app/manager/courses/page.js лишається як був (SSR при прямому заході/F5),
// цей роут — для вкладки, що відкривають ПОВТОРНО в тому самому сеансі,
// без реального переходу Next.js.
export async function GET() {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerTier(employee)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const enrollments = sortByUrgency(await getEmployeeEnrollments(employee.id));
  return NextResponse.json({ enrollments, hasEmail: Boolean(employee.email) });
}
