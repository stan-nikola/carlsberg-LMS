import { prisma } from "@/lib/prisma";
import { SYSTEM_ADMIN_EXTERNAL_CODE } from "@/lib/adminAuth";
import { notifyCourseAssigned } from "@/lib/notifications";

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

  // createManyAndReturn (не createMany): треба знати, КОМУ саме створився
  // Enrollment, щоб сповістити лише їх — пропущені (skipDuplicates) курс
  // уже мали й повторного «Вам призначено» не заслуговують.
  const created = await prisma.enrollment.createManyAndReturn({
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
    select: { employeeId: true },
  });

  if (created.length > 0) {
    // Сповіщення — best-effort: призначення вже в базі, збій доставки не
    // має відкотити бізнес-дію чи зламати відповідь адмінці.
    try {
      await notifyCourseAssigned(course, created.map((e) => e.employeeId));
    } catch (err) {
      console.warn("[notifications] course assigned:", err?.message);
    }
  }

  return {
    assignedCount: created.length,
    skippedCount: employeeIds.length - created.length,
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
      OR: [
        { targetPositions: { isEmpty: false } },
        { targetTerritories: { isEmpty: false } },
        { targetEmployeeIds: { isEmpty: false } },
      ],
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
 * territoryIds має ДВІ ролі одночасно, залежно від того, чи задано
 * positionCodes:
 *   - positionCodes НЕ порожній: territoryIds лише звужує (AND) вибірку
 *     по посаді — "усі SV із цих територій".
 *   - positionCodes порожній: territoryIds сам по собі шукає всіх, чий
 *     Employee.territoryId входить у список — "хто б не сидів на цій
 *     території". Це потрібно, бо TerritoryPicker дозволяє відмітити
 *     чек-бокс САМОЇ території (не розгортаючи її до конкретної людини),
 *     і без цієї гілки таке призначення раніше нікого не знаходило —
 *     territoryIds просто ігнорувався (реальний баг, знайдено 2026-09-09:
 *     курс з лише targetTerritories=[136] не створював Enrollment для SV
 *     цієї території).
 *
 * employeeIds — точкове призначення конкретним людям в ОБХІД
 * posada/territoryId-фільтра (об'єднується з рештою, не замінює її):
 * потрібне для польових ролей (ТП/Мерчендайзер/Технік), яких імпорт
 * зміг прив'язати по territoryId лише до цілого RM-регіону — див.
 * Course.targetEmployeeIds у schema.prisma.
 *
 * Принаймні одне з positionCodes/territoryIds/employeeIds має бути
 * непорожнім, інакше нема кого шукати.
 *
 * @param {number} courseId
 * @param {{ positionCodes?: string[], territoryIds?: number[], employeeIds?: number[], assignedByUserId: number }} options
 * @returns {Promise<{ assignedCount: number, skippedCount: number }>}
 */
/**
 * Хто саме мається на увазі під «посади + території + конкретні люди» —
 * спільно для призначення курсу і масової видачі відзнаки
 * (app/api/admin/badges/[badgeId]/award).
 * @returns {Promise<number[]>} унікальні employeeId
 */
export async function resolveTargetEmployeeIds({ positionCodes = [], territoryIds = [], employeeIds = [] }) {
  if (positionCodes.length === 0 && territoryIds.length === 0 && employeeIds.length === 0) {
    throw new Error("Provide positionCodes, territoryIds and/or employeeIds — nothing to assign otherwise");
  }
  const idsFromPositions =
    positionCodes.length > 0
      ? (
          await prisma.employee.findMany({
            where: {
              position: { code: { in: positionCodes } },
              ...(territoryIds.length > 0 ? { territoryId: { in: territoryIds } } : {}),
            },
            select: { id: true },
          })
        ).map((e) => e.id)
      : [];

  // Без positionCodes territoryIds ще ніде не застосований вище — шукаємо
  // напряму по Employee.territoryId (див. коментар функції).
  const idsFromTerritoriesOnly =
    positionCodes.length === 0 && territoryIds.length > 0
      ? (
          await prisma.employee.findMany({
            where: { territoryId: { in: territoryIds } },
            select: { id: true },
          })
        ).map((e) => e.id)
      : [];

  return Array.from(new Set([...idsFromPositions, ...idsFromTerritoriesOnly, ...employeeIds]));
}

export async function assignCourseToPositionsAndTerritories(courseId, { positionCodes, territoryIds, employeeIds, assignedByUserId }) {
  const allIds = await resolveTargetEmployeeIds({ positionCodes, territoryIds, employeeIds });
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
  return enrollEmployees(course, allIds, assignedByUserId);
}

/**
 * Призначає одному співробітнику всі курси, позначені
 * `Course.assignOnFirstLogin` — курси "для новоприбулих". Викликається
 * рівно в момент ПЕРШОГО успішного входу (lib/auth.js, там же, де
 * проставляється Employee.firstLoginAt), а не при створенні запису в
 * базі: співробітники потрапляють у базу пачками з HR-імпорту, і
 * призначення на тому етапі копило б прострочення тим, хто платформу
 * жодного разу не відкривав.
 *
 * Повторний виклик безпечний: enrollEmployees йде через
 * createMany(skipDuplicates), а @@unique([employeeId, courseId]) на
 * Enrollment гарантує, що другий раз той самий курс не з'явиться.
 *
 * Призначення пишеться від системного Employee (SYSTEM-ADMIN), як і
 * будь-яка інша дія без конкретного автора — сам співробітник не
 * "призначає" курс собі.
 *
 * @param {number} employeeId
 * @returns {Promise<{ assignedCount: number }>}
 */
export async function assignFirstLoginCourses(employeeId) {
  const courses = await prisma.course.findMany({ where: { assignOnFirstLogin: true } });
  if (courses.length === 0) return { assignedCount: 0 };

  const systemAdmin = await prisma.employee.findFirst({
    where: { externalCode: SYSTEM_ADMIN_EXTERNAL_CODE },
  });
  if (!systemAdmin) {
    throw new Error("System admin employee not found — run prisma/seed.js");
  }

  let assignedCount = 0;
  for (const course of courses) {
    const result = await enrollEmployees(course, [employeeId], systemAdmin.id);
    assignedCount += result.assignedCount;
  }
  return { assignedCount };
}
