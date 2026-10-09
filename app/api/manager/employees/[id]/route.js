import { NextResponse } from "next/server";
import { requireManager } from "@/lib/session";
import { getAllSubordinates } from "@/lib/permissions";
import { getEmployeeDetail } from "@/lib/managerDashboard";

// GET /api/manager/employees/[id] — детальний список призначень +
// історія спроб ОДНОГО підлеглого, ліниво тягнеться лише коли керівник
// розкриває картку саме цієї людини в дереві команди.
//
// Обов'язкова перевірка меж ієрархії: [id] має бути серед
// getAllSubordinates(поточний керівник) — інакше будь-який SV/ASM міг би
// підставити чужий employeeId в URL і побачити бали/дати людини поза
// своєю командою. Адмін-роль (hasFullAccess) тут навмисно НЕ обходить цю
// перевірку — /manager це кабінет для штатної ієрархії, а не для
// admin/hr_manager (ті мають /admin з повним доступом окремо).
export async function GET(request, { params }) {
  const { manager: employee, denied } = await requireManager();
  if (denied) return denied;

  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const subordinateIds = await getAllSubordinates(employee.id);
  if (!subordinateIds.includes(targetId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const enrollments = await getEmployeeDetail(targetId);
  return NextResponse.json({ enrollments });
}
