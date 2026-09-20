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
 * Один SQL-запит з рекурсивним CTE замість колишнього BFS-циклу
 * (await prisma.employee.findMany на кожен рівень ієрархії) — той самий
 * привід і фікс, що вже застосований до getTeamTree (lib/managerDashboard.js,
 * 2026-09-20, аудит "стало ще гірше"): ця функція викликається з
 * getManagerOverview на КОЖЕН холодний рендер /manager, і послідовні
 * round-trip до Neon на serverless коштували секунд, навіть після того,
 * як getTeamTree сам переписали — вузьке місце просто переїхало сюди.
 *
 * @param {number} employeeId
 * @returns {Promise<number[]>}
 */
export async function getAllSubordinates(employeeId) {
  const rows = await prisma.$queryRaw`
    WITH RECURSIVE sub AS (
      SELECT e.id, e."managerId"
      FROM "Employee" e
      WHERE e."managerId" = ${employeeId}
      UNION ALL
      SELECT e.id, e."managerId"
      FROM "Employee" e
      INNER JOIN sub s ON e."managerId" = s.id
    )
    SELECT id FROM sub
  `;
  return rows.map((row) => row.id);
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
