import { prisma } from "@/lib/prisma";
import { SYSTEM_ADMIN_EXTERNAL_CODE } from "@/lib/adminAuth";

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
 * Вызывается ежедневным cron (app/api/cron/check-overdue-enrollments/route.js).
 * Находит курсы с publishAt в прошлом, которые ещё не авто-назначались
 * (autoAssignedAt == null), и назначает их по сохранённым в курсе
 * targetPositions/targetTerritories — от имени системного Employee
 * (см. lib/adminAuth.js SYSTEM_ADMIN_EXTERNAL_CODE), т.к. /admin не привязан
 * к конкретному сотруднику (см. app/api/admin/login/route.js).
 *
 * @returns {Promise<{ publishedCount: number, assignedCount: number }>}
 */
export async function publishScheduledCourses() {
  const now = new Date();

  const dueCourses = await prisma.course.findMany({
    where: {
      publishAt: { lte: now },
      autoAssignedAt: null,
      OR: [{ targetPositions: { isEmpty: false } }, { targetEmployeeIds: { isEmpty: false } }],
    },
  });

  if (dueCourses.length === 0) {
    return { publishedCount: 0, assignedCount: 0 };
  }

  const systemAdmin = await prisma.employee.findFirst({
    where: { externalCode: SYSTEM_ADMIN_EXTERNAL_CODE },
  });
  if (!systemAdmin) {
    throw new Error("System admin employee not found — run prisma/seed.js");
  }

  let assignedCount = 0;
  for (const course of dueCourses) {
    const result = await assignCourseToPositionsAndTerritories(course.id, {
      positionCodes: course.targetPositions,
      territoryIds: course.targetTerritories,
      employeeIds: course.targetEmployeeIds,
      assignedByUserId: systemAdmin.id,
    });
    assignedCount += result.assignedCount;
    await prisma.course.update({ where: { id: course.id }, data: { autoAssignedAt: now } });
  }

  return { publishedCount: dueCourses.length, assignedCount };
}

/**
 * Назначает курс сразу на список должностей и/или территорий одним
 * действием (для эндпоинта массового назначения администратором) —
 * в отличие от assignCourseToRole, список должностей и территорий
 * задаётся вызовом, а не берётся из course.targetPositions/targetTerritories.
 *
 * employeeIds — точкове призначення конкретним людям в ОБХІД
 * posada/territoryId-фільтра (об'єднується з positionCodes/territoryIds,
 * не замінює їх): потрібне для польових ролей (ТП/Мерчендайзер/Технік),
 * яких імпорт зміг прив'язати по territoryId лише до цілого RM-регіону —
 * див. Course.targetEmployeeIds у schema.prisma. Принаймні одне з
 * positionCodes/employeeIds має бути непорожнім, інакше нема кого шукати.
 *
 * @param {number} courseId
 * @param {{ positionCodes?: string[], territoryIds?: number[], employeeIds?: number[], assignedByUserId: number }} options
 * @returns {Promise<{ assignedCount: number, skippedCount: number }>}
 */
export async function assignCourseToPositionsAndTerritories(
  courseId,
  { positionCodes = [], territoryIds = [], employeeIds = [], assignedByUserId }
) {
  if (positionCodes.length === 0 && employeeIds.length === 0) {
    throw new Error("Provide positionCodes and/or employeeIds — nothing to assign otherwise");
  }

  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });

  const idsFromPositions =
    positionCodes.length > 0
      ? (
          await prisma.employee.findMany({
            where: {
              position: { code: { in: positionCodes } },
              ...(territoryIds && territoryIds.length > 0 ? { territoryId: { in: territoryIds } } : {}),
            },
            select: { id: true },
          })
        ).map((e) => e.id)
      : [];

  const allIds = Array.from(new Set([...idsFromPositions, ...employeeIds]));

  return enrollEmployees(course, allIds, assignedByUserId);
}
