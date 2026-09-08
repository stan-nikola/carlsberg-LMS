import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasFullAccess } from "@/lib/permissions";
import { assignCourseToPositionsAndTerritories } from "@/lib/courseAssignment";

// ВРЕМЕННАЯ ЗАГЛУШКА, НЕБЕЗОПАСНО ДЛЯ ПРОДА: сейчас currentUser берётся по
// id из заголовка x-user-id, который присылает клиент — это легко
// подделать (любой может прислать чужой id/роль admin). Реальной
// аутентификации в проекте ещё нет (её перенос — Шаг 3 миграции). Как
// только появится сессия/токен — заменить на чтение currentUser оттуда,
// а не из заголовка запроса.
async function getCurrentUser(request) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return null;
  return prisma.employee.findUnique({ where: { id: Number(userId) } });
}

/**
 * POST /api/admin/courses/:courseId/assign
 * Body: { positionCodes: string[], territoryIds?: number[] }
 *
 * Назначает курс сразу на список должностей и/или территорий одним
 * действием (не по одному сотруднику).
 */
export async function POST(request, { params }) {
  const currentUser = await getCurrentUser(request);
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
