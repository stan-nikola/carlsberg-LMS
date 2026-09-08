import { NextResponse } from "next/server";
import { hasFullAccess } from "@/lib/permissions";
import { assignCourseToPositionsAndTerritories } from "@/lib/courseAssignment";
import { getCurrentUser } from "@/lib/session";

/**
 * POST /api/admin/courses/:courseId/assign
 * Body: { positionCodes: string[], territoryIds?: number[] }
 *
 * Назначает курс сразу на список должностей и/или территорий одним
 * действием (не по одному сотруднику).
 */
export async function POST(request, { params }) {
  const currentUser = await getCurrentUser();
  if (!hasFullAccess(currentUser)) {
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

  const result = await assignCourseToPositionsAndTerritories(Number(courseId), {
    positionCodes,
    territoryIds,
    assignedByUserId: currentUser.id,
  });

  return NextResponse.json(result);
}
