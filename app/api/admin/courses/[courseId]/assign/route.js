import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { adminGuard, getSystemAdminId } from "@/lib/adminAuth";
import { assignCourseToPositionsAndTerritories } from "@/lib/courseAssignment";

/**
 * POST /api/admin/courses/:courseId/assign
 * Body: { positionCodes?: string[], territoryIds?: number[], employeeIds?: number[] }
 *
 * Назначает курс сразу на список должностей и/или территорий, и/или
 * конкретных сотрудников (employeeIds — точковий вибір в обхід
 * posada/territoryId, див. lib/courseAssignment.js) одним действием.
 */
export async function POST(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { courseId } = await params;
  const body = await request.json().catch(() => ({}));
  const { positionCodes = [], territoryIds = [], employeeIds = [] } = body;

  if (positionCodes.length === 0 && territoryIds.length === 0 && employeeIds.length === 0) {
    return NextResponse.json(
      { error: "Потрібна хоча б одна посада, територія або хоча б один конкретний співробітник" },
      { status: 400 }
    );
  }

  // У /admin нема «свого» Employee — Enrollment.assignedById пишемо від системного.
  const systemAdminId = await getSystemAdminId();
  if (!systemAdminId) {
    return NextResponse.json(
      { error: "System admin employee not found — run prisma/seed.js" },
      { status: 500 }
    );
  }

  const result = await assignCourseToPositionsAndTerritories(Number(courseId), {
    positionCodes,
    territoryIds,
    employeeIds,
    assignedByUserId: systemAdminId,
  });
  await audit("course.assign", "course", courseId, { positionCodes, territoryIds, employeeIds, result });

  return NextResponse.json(result);
}
