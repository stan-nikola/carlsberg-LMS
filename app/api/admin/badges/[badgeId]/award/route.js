import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { audit } from "@/lib/audit";
import { resolveTargetEmployeeIds } from "@/lib/courseAssignment";
import { NOT_MANUAL_MESSAGE, awardManualBadge } from "@/lib/manualBadges";

/**
 * POST /api/admin/badges/:badgeId/award — масова видача ручної відзнаки
 * тим самим «деревом», що й призначення курсу: { positionCodes,
 * territoryIds, employeeIds, note }. Хто вже має — пропускається
 * (@@unique employeeId+badgeId, skipDuplicates). Бали рейтингу і
 * сповіщення — лише за новими видачами, як і при ручній видачі з картки.
 */
export async function POST(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { badgeId } = await params;
  const body = await request.json().catch(() => ({}));
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
  const award = await awardManualBadge(Number(badgeId), ids, body.note || null);
  if (award.error === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (award.error === "not_manual") return NextResponse.json({ error: NOT_MANUAL_MESSAGE }, { status: 400 });
  const { badge, awardedIds } = award;
  const result = { awardedCount: awardedIds.length, skippedCount: ids.length - awardedIds.length };
  await audit("badge.award_bulk", "badge", badge.id, { title: badge.title, positionCodes: body.positionCodes, territoryIds: body.territoryIds, employeeIds: body.employeeIds, ...result });
  return NextResponse.json(result);
}
