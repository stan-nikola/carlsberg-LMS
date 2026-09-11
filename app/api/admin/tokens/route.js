import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { createApiToken } from "@/lib/adminApiToken";

// GET /api/admin/tokens — список виданих токенів (без самих значень —
// вони ніде не зберігаються у відкритому вигляді, лише хеш) для екрана
// керування "Excel — жива книга".
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tokens = await prisma.adminApiToken.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
      employee: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json({ tokens });
}

// POST /api/admin/tokens — { employeeId, label } — employeeId ОБОВ'ЯЗКОВО
// має бути role admin/hr_manager (персональна прив'язка до пошти
// конкретної людини, не анонімний /admin-пароль). Сирий токен
// повертається лише в цій відповіді — більше ніде і ніколи.
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const employeeId = Number(body.employeeId);
  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { role: true } });
  if (!employee || !["admin", "hr_manager"].includes(employee.role)) {
    return NextResponse.json({ error: "employee must have role admin or hr_manager" }, { status: 400 });
  }

  const { id, rawToken } = await createApiToken(employeeId, body.label);
  return NextResponse.json({ id, token: rawToken }, { status: 201 });
}
