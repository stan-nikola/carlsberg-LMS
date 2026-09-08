import { prisma } from "@/lib/prisma";

// Роли с полным доступом ко всем данным, минуя иерархию managerId.
// "admin" и "hr_manager" равнозначны — вторая роль лишь другая подпись
// в интерфейсе (см. ШАГ 1 задания).
const FULL_ACCESS_ROLES = new Set(["admin", "hr_manager"]);

/**
 * true для пользователя с ролью "admin" или "hr_manager" — полный доступ
 * ко всем сотрудникам, курсам и отчётам, без ограничения по иерархии.
 *
 * @param {{ role?: string }} user
 * @returns {boolean}
 */
export function hasFullAccess(user) {
  return Boolean(user) && FULL_ACCESS_ROLES.has(user.role);
}

/**
 * Рекурсивно возвращает id всех сотрудников вниз по цепочке managerId,
 * начиная от employeeId (сам employeeId в результат не входит).
 *
 * Обходит дерево уровень за уровнем (BFS: все прямые подчинённые сразу
 * одним запросом, затем их подчинённые и т.д.), а не рекурсией по одному
 * сотруднику за раз — иначе на большой орг-структуре (RM → ASM → SV → SR
 * → MR, потенциально сотни MR) вышло бы N+1 запросов к БД.
 *
 * @param {number} employeeId
 * @returns {Promise<number[]>}
 */
export async function getAllSubordinates(employeeId) {
  const allSubordinateIds = [];
  let currentLevelIds = [employeeId];

  while (currentLevelIds.length > 0) {
    const directReports = await prisma.employee.findMany({
      where: { managerId: { in: currentLevelIds } },
      select: { id: true },
    });

    if (directReports.length === 0) break;

    const nextLevelIds = directReports.map((employee) => employee.id);
    allSubordinateIds.push(...nextLevelIds);
    currentLevelIds = nextLevelIds;
  }

  return allSubordinateIds;
}

/**
 * Возвращает id сотрудников, видимых currentUser:
 * - "admin" / "hr_manager" — все сотрудники в системе;
 * - остальные ("employee") — сам currentUser + все его подчинённые вниз
 *   по цепочке managerId (RM → ASM → SV → SR → MR).
 *
 * Используется как фильтр во всех API routes, отдающих список сотрудников
 * или их прогресс по курсам.
 *
 * @param {{ id: number, role?: string }} currentUser
 * @returns {Promise<number[]>}
 */
export async function getVisibleEmployeeIds(currentUser) {
  if (hasFullAccess(currentUser)) {
    const allEmployees = await prisma.employee.findMany({
      select: { id: true },
    });
    return allEmployees.map((employee) => employee.id);
  }

  const subordinateIds = await getAllSubordinates(currentUser.id);
  return [currentUser.id, ...subordinateIds];
}
