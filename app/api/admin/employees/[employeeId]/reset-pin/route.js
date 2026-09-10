import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { requestLoginPin } from "@/lib/auth";

// POST /api/admin/employees/:employeeId/reset-pin — "скидання PIN" адміном:
// одразу генерує НОВИЙ PIN і висилає його тим самим каналом, що й звичайний
// вхід (сам співробітник, якщо є email, інакше керівник) — старий PIN
// одразу стає недійсним (createPin у lib/auth.js завжди перезаписує).
// Не просто очищує loginPin — порожній PIN нічим не кращий для
// співробітника, якому не прийшов лист: реальна потреба тут ("забув / не
// отримав код") закривається саме форсованою повторною відправкою.
export async function POST(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { employeeId } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id: Number(employeeId) },
    select: { externalCode: true },
  });
  if (!employee) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const result = await requestLoginPin(employee.externalCode);
  if (!result.ok) {
    return NextResponse.json(result, { status: 422 });
  }
  return NextResponse.json(result);
}
