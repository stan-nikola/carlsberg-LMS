import { prisma } from "@/lib/prisma";

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Создаёт Enrollment для списка сотрудников на курс: считает dueDate из
 * course.deadlineDays и копирует course.isMandatory на момент назначения.
 * Сотрудники, у которых Enrollment на этот курс уже есть, тихо
 * пропускаются (skipDuplicates) — функцию безопасно вызывать повторно.
 *
 * @param {{ id: number, deadlineDays: number | null, isMandatory: boolean }} course
 * @param {number[]} employeeIds
 * @param {number} assignedByUserId
 */
async function enrollEmployees(course, employeeIds, assignedByUserId) {
  if (employeeIds.length === 0) {
    return { assignedCount: 0, skippedCount: 0 };
  }

  const assignedAt = new Date();
  const dueDate =
    course.deadlineDays != null ? addDays(assignedAt, course.deadlineDays) : null;

  const result = await prisma.enrollment.createMany({
    data: employeeIds.map((employeeId) => ({
      employeeId,
      courseId: course.id,
      assignedById: assignedByUserId,
      assignedAt,
      dueDate,
      isMandatory: course.isMandatory,
      status: "not_started",
    })),
    skipDuplicates: true,
  });

  return {
    assignedCount: result.count,
    skippedCount: employeeIds.length - result.count,
  };
}

/**
 * Назначает курс всем сотрудникам с должностью positionCode. Если у курса
 * заполнено targetTerritories — назначение ограничивается сотрудниками из
 * этих территорий; если targetTerritories пуст — территория не
 * учитывается (курс идёт всем с этой должностью).
 *
 * @param {number} courseId
 * @param {string} positionCode — например "SR"
 * @param {number} assignedByUserId
 * @returns {Promise<{ assignedCount: number, skippedCount: number }>}
 */
export async function assignCourseToRole(courseId, positionCode, assignedByUserId) {
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  const position = await prisma.position.findUniqueOrThrow({
    where: { code: positionCode },
  });

  const employees = await prisma.employee.findMany({
    where: {
      positionId: position.id,
      ...(course.targetTerritories.length > 0
        ? { territoryId: { in: course.targetTerritories } }
        : {}),
    },
    select: { id: true },
  });

  return enrollEmployees(
    course,
    employees.map((e) => e.id),
    assignedByUserId
  );
}

/**
 * Назначает курс сразу на список должностей и/или территорий одним
 * действием (для эндпоинта массового назначения администратором) —
 * в отличие от assignCourseToRole, список должностей и территорий
 * задаётся вызовом, а не берётся из course.targetPositions/targetTerritories.
 *
 * @param {number} courseId
 * @param {{ positionCodes: string[], territoryIds?: number[], assignedByUserId: number }} options
 * @returns {Promise<{ assignedCount: number, skippedCount: number }>}
 */
export async function assignCourseToPositionsAndTerritories(
  courseId,
  { positionCodes, territoryIds, assignedByUserId }
) {
  if (!Array.isArray(positionCodes) || positionCodes.length === 0) {
    throw new Error("positionCodes must be a non-empty array");
  }

  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });

  const employees = await prisma.employee.findMany({
    where: {
      position: { code: { in: positionCodes } },
      ...(territoryIds && territoryIds.length > 0
        ? { territoryId: { in: territoryIds } }
        : {}),
    },
    select: { id: true },
  });

  return enrollEmployees(
    course,
    employees.map((e) => e.id),
    assignedByUserId
  );
}
