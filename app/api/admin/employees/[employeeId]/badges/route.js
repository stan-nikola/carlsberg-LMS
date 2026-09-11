import { NextResponse } from "next/server";
import { requireAdmin, SYSTEM_ADMIN_EXTERNAL_CODE } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/employees/:employeeId/badges — ачивки конкретної людини
// (для вкладки "Ачивки" на детальній картці, Фаза A + C разом).
export async function GET(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { employeeId } = await params;
  const awards = await prisma.employeeBadge.findMany({
    where: { employeeId: Number(employeeId) },
    orderBy: { awardedAt: "desc" },
    select: {
      id: true,
      awardedAt: true,
      note: true,
      badge: { select: { id: true, title: true, icon: true, description: true, kind: true } },
      awardedBy: { select: { name: true } },
    },
  });
  return NextResponse.json({ awards });
}

// POST /api/admin/employees/:employeeId/badges — { badgeId, note } — ручна
// видача. /admin — окремий вхід по паролю (lib/adminAuth.js), у запиту
// нема "свого" Employee — awardedById пишемо від системного, той самий
// підхід, що Enrollment.assignedById в assign/route.js.
// @@unique(employeeId,badgeId) у схемі — повторна видача поверне 409, не
// тихий дубль.
export async function POST(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { employeeId } = await params;
  const body = await request.json();
  const badgeId = Number(body.badgeId);
  if (!badgeId) return NextResponse.json({ error: "badgeId is required" }, { status: 400 });

  const systemAdmin = await prisma.employee.findFirst({ where: { externalCode: SYSTEM_ADMIN_EXTERNAL_CODE } });
  if (!systemAdmin) {
    return NextResponse.json({ error: "System admin employee not found — run prisma/seed.js" }, { status: 500 });
  }

  try {
    const created = await prisma.employeeBadge.create({
      data: {
        employeeId: Number(employeeId),
        badgeId,
        awardedById: systemAdmin.id,
        note: body.note || null,
      },
      select: {
        id: true,
        awardedAt: true,
        note: true,
        badge: { select: { id: true, title: true, icon: true, description: true, kind: true } },
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "ця ачивка вже видана цій людині" }, { status: 409 });
    }
    throw err;
  }
}
