import { cacheLife, cacheTag } from "next/cache";
import { getAllSubordinates } from "@/lib/permissions";
import { getTeamTree, getTeamSummary, getDashboardStats, getWeeklyTrend } from "@/lib/managerDashboard";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { getEmployeeRating, getTeamRating } from "@/lib/rating";

/**
 * Дані кабінету керівника (/manager) — дерево команди, підсумок по кожній
 * людині, KPI/графіки, власні курси, рейтинг. Раніше рахувалось у
 * app/api/manager/overview/route.js і забиралось з клієнта звичайним
 * fetch() у ManagerDashboard.jsx на кожному монтуванні — тобто ПОВЗ усю
 * систему кешування Cache Components (JSON-відповідь Route Handler не
 * бере участі в client Router Cache), тож "головний" екран лишався
 * найважчим навіть після переходу getEmployeeEnrollments на кеш (аудит
 * "быстродействия не почувствовал", 2026-09-19). Винесено сюди й
 * викликається напряму з app/manager/page.js (Server Component) — тоді
 * "use cache: private" реально кешує результат у пам'яті браузера,
 * а не сервера (той самий привід, що й у lib/employeeProgress.js).
 *
 * teamOverview приймає лише ПРИМІТИВИ (employeeId), не весь об'єкт
 * employee — той самий урок, що вже застосований у lib/rating.ts
 * (комент там: "unstable_cache бере аргументи виклику як частину ключа
 * кешу... тому кешований шар приймає лише примітиви"). Той самий принцип
 * стосується й "use cache"/"use cache: private" — full-об'єкт employee
 * саме тут і був причиною того, що скелетон на /manager так і лишався:
 * ключ кешу з нього не збігався між рендерами, кеш ніколи не влучав.
 * Тривіальні власні поля (ім'я, код, аватар) — без похід у базу, тож
 * збираються ЗНАДВОРУ кеш-межі (app/manager/page.js), не тут.
 */
export async function getManagerOverview(employeeId, positionId) {
  "use cache: private";
  cacheLife("minutes");
  cacheTag("manager-overview");

  // team.tree НЕ входить сюди навмисно (аудит "вообще без скелетонов
  // мгновенно", 2026-09-20): getTeamTree — найважчий за DOM-розміром і
  // рендер-ціною блок ("Детально по команді"), а "Статус по людях"
  // (peopleStatus), що раніше теж на нього спирався, прибрано з дефолтних
  // карток керівника саме тому. Дерево тепер підвантажується ОКРЕМО —
  // getManagerTeamTree нижче, викликається лише коли ManagerDashboard.jsx
  // реально його потребує (IntersectionObserver на секції "Детально по
  // команді", або одразу — якщо керівник сам увімкнув peopleStatus/
  // teamCompare). summaryByEmployeeId рахується з subordinateIds
  // (getAllSubordinates), не з дерева — тому лишається тут без змін.
  const [subordinateIds, myEnrollments] = await Promise.all([
    getAllSubordinates(employeeId),
    getEmployeeEnrollments(employeeId),
  ]);

  const [summaryMap, stats, weeklyTrend] = await Promise.all([
    getTeamSummary(subordinateIds),
    getDashboardStats(subordinateIds),
    getWeeklyTrend(subordinateIds),
  ]);
  const [{ level }, rating] = await Promise.all([
    getEmployeeRating({ id: employeeId, positionId }),
    getTeamRating({ id: employeeId, positionId }),
  ]);

  return {
    levelLabel: level.label,
    enrollments: myEnrollments,
    team: {
      // Map не серіалізується в JSON напряму — переганяємо в звичайний
      // об'єкт {employeeId: summary}, клієнт читає по id.
      summaryByEmployeeId: Object.fromEntries(summaryMap),
      stats,
      weeklyTrend,
      rating,
    },
  };
}

/**
 * Дерево команди — ОКРЕМО від getManagerOverview (див. коментар вище).
 * Той самий "use cache: private" + примітивний employeeId, викликається з
 * app/api/manager/team-tree/route.js на явний клієнтський fetch.
 */
export async function getManagerTeamTree(employeeId) {
  "use cache: private";
  cacheLife("minutes");
  cacheTag("manager-overview");
  return getTeamTree(employeeId);
}
