import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

const VALID_ROLES = ["employee", "admin", "hr_manager"];

// PATCH /api/admin/employees/:employeeId — { role }. Свідомо єдине
// settable-поле тут: це екран призначення ролі (Role — надбудова над
// ієрархією посад, admin/hr_manager отримують повний доступ), не
// загальний редактор картки співробітника. Будь-які інші поля
// (managerId, positionId, email тощо) походять з реального імпорту й тут
// навмисно не редагуються.
export async function PATCH(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { employeeId } = await params;
  const body = await request.json();

  if (!VALID_ROLES.includes(body.role)) {
    return NextResponse.json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` }, { status: 400 });
  }

  const updated = await prisma.employee.update({
    where: { id: Number(employeeId) },
    data: { role: body.role },
    select: { id: true, name: true, externalCode: true, role: true },
  });
  return NextResponse.json(updated);
}
