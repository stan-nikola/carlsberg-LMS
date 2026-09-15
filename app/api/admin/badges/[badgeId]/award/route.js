import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { resolveTargetEmployeeIds } from "@/lib/courseAssignment";
import { recordBadgeAward } from "@/lib/rating";
import { notifyBadgeAwarded } from "@/lib/notifications";

/**
 * POST /api/admin/badges/:badgeId/award — масова видача ручної відзнаки
 * тим самим «деревом», що й призначення курсу: { positionCodes,
 * territoryIds, employeeIds, note }. Хто вже має — пропускається
 * (@@unique employeeId+badgeId, skipDuplicates). Бали рейтингу і
 * сповіщення — лише за новими видачами, як і при ручній видачі з картки.
 */
export async function POST(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { badgeId } = await params;
  const badge = await prisma.badge.findUnique({ where: { id: Number(badgeId) }, select: { id: true, title: true, kind: true, points: true, icon: true, description: true } });
  if (!badge) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (badge.kind !== "manual") return NextResponse.json({ error: "Автоматичні відзнаки нараховує cron, вручну їх не видають" }, { status: 400 });

  const body = await request.json();
  let ids;
  try {
    ids = await resolveTargetEmployeeIds({
      positionCodes: Array.isArray(body.positionCodes) ? body.positionCodes : [],
      territoryIds: Array.isArray(body.territoryIds) ? body.territoryIds.map(Number) : [],
      employeeIds: Array.isArray(body.employeeIds) ? body.employeeIds.map(Number) : [],
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  const systemAdmin = await prisma.employee.findFirst({ where: { externalCode: "SYSTEM-ADMIN" }, select: { id: true } });

  const created = await prisma.employeeBadge.createManyAndReturn({
    data: ids.map((employeeId) => ({ employeeId, badgeId: badge.id, awardedById: systemAdmin?.id ?? null, note: body.note || null })),
    skipDuplicates: true,
    select: { employeeId: true },
  });
  for (const c of created) {
    try {
      await recordBadgeAward(c.employeeId, badge);
    } catch (err) {
      console.warn("[rating] mass badge:", err?.message);
    }
  }
  try {
    await notifyBadgeAwarded(created.map((c) => ({ employeeId: c.employeeId, badge })));
  } catch (err) {
    console.warn("[notifications] mass badge:", err?.message);
  }
  const result = { awardedCount: created.length, skippedCount: ids.length - created.length };
  await audit("badge.award_bulk", "badge", badge.id, { title: badge.title, positionCodes: body.positionCodes, territoryIds: body.territoryIds, employeeIds: body.employeeIds, ...result });
  return NextResponse.json(result);
}
