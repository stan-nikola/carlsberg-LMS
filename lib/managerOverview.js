import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isRecentlyAssigned } from "@/lib/progress";
import { getAllSubordinates } from "@/lib/permissions";
import { getTeamTree, getDashboardStats, getWeeklyTrend, getEmployeeDetail } from "@/lib/managerDashboard";
import { getEmployeeEnrollments } from "@/lib/employeeProgress";
import { getEmployeeRating, getTeamRating } from "@/lib/rating";
import { fetchTeamRaw } from "@/lib/teamEnrollments";
import { attentionTop, buildMatrix, buildPeople, buildTeamRows, courseFunnels, retriedEnrollmentIds, statusBar } from "@/lib/teamInsights";

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
 *
 * Drill-down (2026-09-23): полоса статусів, «Потребують уваги», матриця
 * люди × курси і воронки по курсах рахуються з ОДНОГО набору рядків
 * «людина × курс» (lib/teamEnrollments.ts → lib/teamInsights.ts); ті самі
 * рядки й ті самі фільтри віддає getManagerTeamRows нижче сторінкам
 * /manager/team — тому цифра на картці і довжина списку за кліком
 * збігаються за побудовою. `now` — всередині кеш-межі (Cache Components:
 * читати час у рендері сторінки не можна).
 * ponytail: getDashboardStats і fetchTeamRaw читають enrollments кожен
 * сам (паралельно, в одному кеші) — злити в один прохід, якщо холодний
 * старт /manager помітно виросте.
 */
export async function getManagerOverview(employeeId, positionId) {
  "use cache: private";
  cacheLife("minutes");
  cacheTag("manager-overview");

  const now = new Date();
  // team.tree НЕ входить сюди навмисно (аудит "вообще без скелетонов
  // мгновенно", 2026-09-20): getTeamTree — найважчий за DOM-розміром і
  // рендер-ціною блок ("Детально по команді"). Дерево підвантажується
  // ОКРЕМО — getManagerTeamTree нижче, лише коли ManagerDashboard.jsx
  // реально його потребує (IntersectionObserver на секції, або одразу —
  // якщо керівник увімкнув teamCompare).
  const [subordinateIds, myEnrollments, { level }, rating] = await Promise.all([
    getAllSubordinates(employeeId),
    getEmployeeEnrollments(employeeId),
    getEmployeeRating({ id: employeeId, positionId }),
    getTeamRating({ id: employeeId, positionId }),
  ]);

  const [stats, weeklyTrend, raw] = await Promise.all([
    getDashboardStats(subordinateIds),
    getWeeklyTrend(subordinateIds),
    fetchTeamRaw(subordinateIds),
  ]);
  const rows = buildTeamRows(raw, now);
  const people = buildPeople(rows, raw, now);

  return {
    levelLabel: level.label,
    enrollments: myEnrollments,
    team: {
      // {employeeId: counts} — той самий підсумок на рядок дерева команди,
      // що раніше давав getTeamSummary, тепер із тих самих рядків, що й
      // решта дашборда.
      summaryByEmployeeId: Object.fromEntries(people.map((p) => [p.id, p.counts])),
      stats,
      weeklyTrend,
      rating,
      statusBar: statusBar(people, rows),
      attention: attentionTop(people, rows),
      matrix: buildMatrix(people, rows),
      funnels: courseFunnels(rows),
    },
  };
}

/**
 * Маркер «нове» на пункті «Курси» — чи є в людини щойно призначений і ще
 * не розпочатий курс. Живе в кеш-межі, а не в рендері app/manager/layout.js
 * (2026-09-23): isRecentlyAssigned() за замовчуванням бере `new Date()`, і
 * цей виклик у рендері Server Component — читання часу, яке Cache
 * Components забороняє (E1432 blocking-prerender-current-time). Помилка
 * зривала гідратацію ВСЬОГО /manager: кнопки дашборда не реагували, а
 * вибір карток із localStorage не застосовувався. Усередині "use cache"
 * час читати можна — так само робить getWeeklyTrend.
 */
export async function getHasNewCourses(employeeId) {
  "use cache: private";
  cacheLife("minutes");
  cacheTag("manager-overview");
  const now = new Date();
  const rows = await prisma.enrollment.findMany({
    where: { employeeId },
    select: { assignedAt: true, status: true },
  });
  return rows.some((e) => isRecentlyAssigned(e, now));
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

/**
 * Рядки «людина × курс» для сторінок /manager/team і /manager/team/[id].
 * `now` віддається рядком: сторінка не має права читати час сама
 * (Cache Components), а фільтри дедлайнів його потребують.
 */
export async function getManagerTeamRows(employeeId) {
  "use cache: private";
  cacheLife("minutes");
  cacheTag("manager-overview");
  const now = new Date();
  const subordinateIds = await getAllSubordinates(employeeId);
  const raw = await fetchTeamRaw(subordinateIds);
  const rows = buildTeamRows(raw, now);
  const people = buildPeople(rows, raw, now);
  return {
    rows,
    people,
    now: now.toISOString(),
    retried: Array.from(retriedEnrollmentIds(raw.attempts)),
    courses: raw.courses.map((c) => ({ id: c.id, slug: c.slug, title: c.title, modules: c.modules.map((m) => ({ id: m.id, title: m.title })) })),
  };
}

/** Повний список призначень однієї людини для /manager/team/[id] — той
 *  самий getEmployeeDetail, що й /api/manager/employees/[id], але через
 *  кеш сторінки. Межі ієрархії перевіряє сама сторінка. */
export async function getManagerEmployeeDetail(employeeId) {
  "use cache: private";
  cacheLife("minutes");
  cacheTag("manager-overview");
  return getEmployeeDetail(employeeId);
}
