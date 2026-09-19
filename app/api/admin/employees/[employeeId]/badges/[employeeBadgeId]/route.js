import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { syncBadgeAwards } from "@/lib/rating";

// DELETE /api/admin/employees/:employeeId/badges/:employeeBadgeId —
// відкликати ачивку (помилково видали не тому/не ту). Фізичне видалення
// рядка EmployeeBadge, не soft — на відміну від Employee.isActive тут
// немає причини лишати слід "видано і одразу відкликано", це просто
// виправлення помилки адміна, не історична подія.
export async function DELETE(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { employeeBadgeId } = await params;
  const { employeeId } = await params;
  const removed = await prisma.employeeBadge.delete({ where: { id: Number(employeeBadgeId) }, select: { badgeId: true } });
  // Разом із відзнакою зникають і її бали — інакше відкликана відзнака
  // лишалась би в рейтингу назавжди (RatingEvent на відзнаку посилається
  // через refType/refId, каскаду нема).
  await syncBadgeAwards(removed.badgeId);
  await audit("badge.revoke", "employee", employeeId, { employeeBadgeId: Number(employeeBadgeId), badgeId: removed.badgeId });
  return NextResponse.json({ ok: true });
}
