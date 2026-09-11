import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/employees/:employeeId/badges/:employeeBadgeId —
// відкликати ачивку (помилково видали не тому/не ту). Фізичне видалення
// рядка EmployeeBadge, не soft — на відміну від Employee.isActive тут
// немає причини лишати слід "видано і одразу відкликано", це просто
// виправлення помилки адміна, не історична подія.
export async function DELETE(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { employeeBadgeId } = await params;
  await prisma.employeeBadge.delete({ where: { id: Number(employeeBadgeId) } });
  return NextResponse.json({ ok: true });
}
