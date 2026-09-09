import { NextResponse } from "next/server";
import { requireAdmin, SYSTEM_ADMIN_EXTERNAL_CODE } from "@/lib/adminAuth";
import { assignCourseToPositionsAndTerritories } from "@/lib/courseAssignment";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/courses/:courseId/assign
 * Body: { positionCodes: string[], territoryIds?: number[] }
 *
 * Назначает курс сразу на список должностей и/или территорий одним
 * действием (не по одному сотруднику).
 */
export async function POST(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { courseId } = await params;
  const body = await request.json();
  const { positionCodes, territoryIds } = body;

  if (!Array.isArray(positionCodes) || positionCodes.length === 0) {
    return NextResponse.json(
      { error: "positionCodes is required and must be a non-empty array" },
      { status: 400 }
    );
  }

  // /admin — отдельный вход по паролю (см. lib/adminAuth.js), у запроса
  // нет "своего" Employee — Enrollment.assignedById пишем от системного.
  const systemAdmin = await prisma.employee.findFirst({
    where: { externalCode: SYSTEM_ADMIN_EXTERNAL_CODE },
  });
  if (!systemAdmin) {
    return NextResponse.json(
      { error: "System admin employee not found — run prisma/seed.js" },
      { status: 500 }
    );
  }

  const result = await assignCourseToPositionsAndTerritories(Number(courseId), {
    positionCodes,
    territoryIds,
    assignedByUserId: systemAdmin.id,
  });

  return NextResponse.json(result);
}
