import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { adminGuard } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { createApiToken } from "@/lib/adminApiToken";

// GET /api/admin/tokens — список виданих токенів (без самих значень —
// вони ніде не зберігаються у відкритому вигляді, лише хеш) для екрана
// керування "Excel — жива книга".
export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;

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
  const denied = await adminGuard();
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const employeeId = Number(body.employeeId);
  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { role: true } });
  if (!employee || !["admin", "hr_manager"].includes(employee.role)) {
    return NextResponse.json({ error: "employee must have role admin or hr_manager" }, { status: 400 });
  }

  const { id, rawToken } = await createApiToken(employeeId, body.label);
  await audit("token.create", "token", id, { employeeId, label: body.label || null });
  return NextResponse.json({ id, token: rawToken }, { status: 201 });
}
