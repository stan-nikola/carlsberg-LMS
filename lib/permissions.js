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

// Рівень посади, з якого людина вважається "керівником" для десктопного
// кабінету /manager — SV і вище, до RM включно (рівні 1-3: RM HoReCa,
// ASM/LKAM, SV/SV RKA/FSM MT). Рівні 4-5 (ТП/Технік/Мерчендайзер) лишаються
// на звичайному мобільному /hub. Підтверджено користувачем окремо від
// FULL_ACCESS_ROLES вище — це геть інша вісь: Role — надбудова "адмін
// бачить усе, минаючи ієрархію", а manager-tier — "ця людина сама є
// керівником у штатній ієрархії" (не звільняє від фільтра managerId).
const MANAGER_TIER_MAX_LEVEL = 3;

/**
 * true, якщо employee.position.level потрапляє у керівний шар (SV..RM).
 * Потребує employee.position — див. include: { position: true } у
 * getCurrentUser() (lib/session.js).
 *
 * @param {{ position?: { level?: number } | null }} employee
 * @returns {boolean}
 */
export function isManagerTier(employee) {
  const level = employee?.position?.level;
  return typeof level === "number" && level <= MANAGER_TIER_MAX_LEVEL;
}

/**
 * Прямі підлеглі (один рівень вниз по managerId) — на відміну від
 * getAllSubordinates нижче (весь піддерево), тут лише безпосередній
 * наступний щабель.
 *
 * Раніше використовувалась рекурсивною побудовою дерева команди
 * (lib/managerDashboard.js getTeamTree); той код відтоді переписаний на
 * власний BFS-обхід (щоб один виклик міг повертати як дерево ОДНОГО
 * керівника, так і дерево ВСІЄЇ організації для редактора в /admin,
 * managerId === null) і більше цю функцію не імпортує. Лишена як
 * самостійний util — не видаляти без перевірки нових викликів.
 *
 * @param {number} managerId
 * @returns {Promise<Array<{id:number,name:string,positionId:number|null,territoryId:number|null}>>}
 */
export async function getDirectReports(managerId) {
  return prisma.employee.findMany({
    where: { managerId },
    select: {
      id: true,
      name: true,
      position: { select: { code: true, name: true, level: true } },
      territory: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
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
