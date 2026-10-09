import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { adminGuard } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { NOT_MANUAL_MESSAGE, awardManualBadge } from "@/lib/manualBadges";

// GET /api/admin/employees/:employeeId/badges — ачивки конкретної людини
// (для вкладки "Ачивки" на детальній картці, Фаза A + C разом).
export async function GET(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

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
// видача одній людині (lib/manualBadges.ts). Повторна — 409, не тихий дубль.
export async function POST(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { employeeId } = await params;
  const body = await request.json().catch(() => ({}));
  const badgeId = Number(body.badgeId);
  if (!badgeId) return NextResponse.json({ error: "badgeId is required" }, { status: 400 });

  const award = await awardManualBadge(badgeId, [Number(employeeId)], body.note || null);
  if (award.error === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (award.error === "not_manual") return NextResponse.json({ error: NOT_MANUAL_MESSAGE }, { status: 400 });
  if (award.awardedIds.length === 0) {
    return NextResponse.json({ error: "цю винагороду вже видано цій людині" }, { status: 409 });
  }
  const created = await prisma.employeeBadge.findUnique({
    where: { employeeId_badgeId: { employeeId: Number(employeeId), badgeId } },
    select: { id: true, awardedAt: true, note: true, badge: { select: { id: true, title: true, icon: true, description: true, kind: true, points: true } } },
  });
  await audit("badge.award", "employee", employeeId, { badgeId, badge: award.badge.title, note: body.note || null });
  return NextResponse.json(created, { status: 201 });
}
