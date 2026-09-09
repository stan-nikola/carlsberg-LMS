import { NextResponse } from "next/server";
import { requireAdmin, SYSTEM_ADMIN_EXTERNAL_CODE } from "@/lib/adminAuth";
import { assignCourseToPositionsAndTerritories } from "@/lib/courseAssignment";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/courses/:courseId/assign
 * Body: { positionCodes?: string[], territoryIds?: number[], employeeIds?: number[] }
 *
 * Назначает курс сразу на список должностей и/или территорий, и/или
 * конкретных сотрудников (employeeIds — точковий вибір в обхід
 * posada/territoryId, див. lib/courseAssignment.js) одним действием.
 */
export async function POST(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { courseId } = await params;
  const body = await request.json();
  const { positionCodes = [], territoryIds, employeeIds = [] } = body;

  if (positionCodes.length === 0 && employeeIds.length === 0) {
    return NextResponse.json(
      { error: "Потрібна хоча б одна посада або хоча б один конкретний співробітник" },
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
    employeeIds,
    assignedByUserId: systemAdmin.id,
  });

  return NextResponse.json(result);
}
