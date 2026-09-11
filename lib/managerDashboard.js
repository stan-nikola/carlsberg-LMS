import { prisma } from "@/lib/prisma";
import { getDirectReports } from "@/lib/permissions";

const NODE_SELECT = {
  id: true,
  name: true,
  position: { select: { code: true, name: true, level: true } },
  territory: { select: { id: true, name: true } },
};

function toNode(employee) {
  return {
    id: employee.id,
    name: employee.name,
    position: employee.position,
    territory: employee.territory,
    children: [],
  };
}

/**
 * Дерево команди керівника (рекурсивно вниз по managerId, обхід рівень за
 * рівнем — той самий BFS-прийом, що й getAllSubordinates у
 * lib/permissions.js, щоб уникнути N+1 на кожен вузол). Корінь дерева —
 * ПРЯМІ підлеглі managerId (сам керівник у дерево не входить, його власні
 * курси показуються окремим блоком "Мої курси" — getEmployeeEnrollments).
 *
 * @param {number} managerId
 * @returns {Promise<Array<{id:number,name:string,position:object|null,territory:object|null,children:Array}>>}
 */
export async function getTeamTree(managerId) {
  const rootReports = await getDirectReports(managerId);
  const nodes = rootReports.map(toNode);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  let currentLevelIds = nodes.map((n) => n.id);
  while (currentLevelIds.length > 0) {
    const children = await prisma.employee.findMany({
      where: { managerId: { in: currentLevelIds } },
      select: { ...NODE_SELECT, managerId: true },
      orderBy: { name: "asc" },
    });
    if (children.length === 0) break;

    const nextLevelIds = [];
    for (const child of children) {
      const node = toNode(child);
      nodeById.set(node.id, node);
      const parent = nodeById.get(child.managerId);
      // Захист від "сирітського" вузла (managerId вказує поза межі щойно
      // обробленого рівня) — теоретично неможливо при коректній ієрархії,
      // але тихо пропустити безпечніше за падіння всього дашборда.
      if (parent) parent.children.push(node);
      nextLevelIds.push(node.id);
    }
    currentLevelIds = nextLevelIds;
  }

  return nodes;
}

/**
 * Легкий підсумок по кожному employeeId одним запитом (без історії спроб) —
 * для рядка команди в дереві. Повний EnrollmentAttempt-список тягнеться
 * лише при розкритті конкретної картки — getEmployeeDetail нижче.
 *
 * @param {number[]} employeeIds
 * @returns {Promise<Map<number, {total:number,completed:number,overdue:number,inProgress:number,avgScore:number|null}>>}
 */
export async function getTeamSummary(employeeIds) {
  const result = new Map();
  if (employeeIds.length === 0) return result;

  const enrollments = await prisma.enrollment.findMany({
    where: { employeeId: { in: employeeIds } },
    select: { employeeId: true, status: true, scorePercent: true, passed: true },
  });

  const acc = new Map(
    employeeIds.map((id) => [
      id,
      { total: 0, completed: 0, overdue: 0, inProgress: 0, notStarted: 0, failed: 0, scoreSum: 0, scoreCount: 0 },
    ])
  );
  for (const e of enrollments) {
    const s = acc.get(e.employeeId);
    if (!s) continue;
    s.total += 1;
    if (e.status === "completed") {
      s.completed += 1;
      if (typeof e.scorePercent === "number") {
        s.scoreSum += e.scorePercent;
        s.scoreCount += 1;
      }
      // Дійшов до кінця, але не набрав прохідний бал — окремо від
      // "completed" (той рахує і успіх, і провал разом), потрібно для
      // фільтра "Не склав" у дереві команди.
      if (e.passed === false) s.failed += 1;
    } else if (e.status === "overdue") {
      s.overdue += 1;
    } else if (e.status === "in_progress") {
      s.inProgress += 1;
    } else if (e.status === "not_started") {
      s.notStarted += 1;
    }
  }

  for (const [id, s] of acc) {
    result.set(id, {
      total: s.total,
      completed: s.completed,
      overdue: s.overdue,
      inProgress: s.inProgress,
      notStarted: s.notStarted,
      failed: s.failed,
      avgScore: s.scoreCount > 0 ? Math.round(s.scoreSum / s.scoreCount) : null,
    });
  }
  return result;
}

/**
 * Повний список призначень конкретного співробітника + історія спроб по
 * кожному (EnrollmentAttempt) — важкий payload, тягнеться лише коли
 * керівник розкриває картку САМЕ цієї людини (app/api/manager/employees/[id]).
 *
 * @param {number} employeeId
 */
export async function getEmployeeDetail(employeeId) {
  const enrollments = await prisma.enrollment.findMany({
    where: { employeeId },
    include: {
      course: {
        select: {
          id: true,
          title: true,
          slug: true,
          isMandatory: true,
          // Курс -> модулі: керівнику раніше було видно лише підсумок по
          // КУРСУ в цілому (бал/дата/тривалість) — тепер, коли курс сам по
          // собі складається з кількох модулів (не пласка залікова
          // одиниця), потрібно бачити, який саме модуль складено, а який
          // ні, а не лише фінальний результат.
          modules: { orderBy: { order: "asc" }, select: { id: true, title: true, order: true } },
        },
      },
    },
    orderBy: { assignedAt: "desc" },
  });

  const enrollmentIds = enrollments.map((e) => e.id);
  const [attempts, moduleCompletions] = enrollmentIds.length
    ? await Promise.all([
        prisma.enrollmentAttempt.findMany({
          where: { enrollmentId: { in: enrollmentIds } },
          orderBy: { completedAt: "desc" },
        }),
        prisma.moduleCompletion.findMany({ where: { enrollmentId: { in: enrollmentIds } } }),
      ])
    : [[], []];

  const attemptsByEnrollment = new Map();
  for (const attempt of attempts) {
    const list = attemptsByEnrollment.get(attempt.enrollmentId) || [];
    list.push(attempt);
    attemptsByEnrollment.set(attempt.enrollmentId, list);
  }
  const completionByEnrollmentAndModule = new Map();
  for (const c of moduleCompletions) {
    completionByEnrollmentAndModule.set(`${c.enrollmentId}:${c.moduleId}`, c);
  }

  return enrollments.map((e) => ({
    id: e.id,
    course: e.course,
    status: e.status,
    assignedAt: e.assignedAt,
    dueDate: e.dueDate,
    completedAt: e.completedAt,
    scorePercent: e.scorePercent,
    passed: e.passed,
    durationSeconds: e.durationSeconds,
    activeTimeSeconds: e.activeTimeSeconds,
    longestCorrectStreak: e.longestCorrectStreak,
    attempts: attemptsByEnrollment.get(e.id) || [],
    // Кожен модуль курсу зі своїм результатом (якщо вже пройдено) —
    // null-поля, коли модуля ще не торкались (не вигадуємо "нуль балів",
    // просто немає даних).
    modules: e.course.modules.map((m) => {
      const completion = completionByEnrollmentAndModule.get(`${e.id}:${m.id}`);
      return {
        id: m.id,
        title: m.title,
        order: m.order,
        scorePercent: completion ? completion.scorePercent : null,
        passed: completion ? completion.passed : null,
        completedAt: completion ? completion.completedAt : null,
        longestCorrectStreak: completion ? completion.longestCorrectStreak : null,
      };
    }),
  }));
}

// Не більше N барів у розбивці "% виконання по курсу" на першому екрані
// дашборда — решта (якщо курсів у команди більше) не рендериться, щоб не
// перевантажувати перший погляд рядом дрібних барів.
const COURSE_BREAKDOWN_LIMIT = 8;

/**
 * Агрегати для KPI-плиток і 2 графіків дашборда (кільце загального %
 * виконання команди + горизонтальні бари по курсах). Один запит по всій
 * видимій команді.
 *
 * @param {number[]} employeeIds
 */
export async function getDashboardStats(employeeIds) {
  if (employeeIds.length === 0) {
    return {
      teamSize: 0,
      completionRate: 0,
      avgScore: null,
      overdueCount: 0,
      passRate: 0,
      onTimeRate: 0,
      engagementRate: 0,
      noActivityCount: 0,
      courseBreakdown: [],
    };
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { employeeId: { in: employeeIds } },
    select: {
      status: true,
      scorePercent: true,
      passed: true,
      employeeId: true,
      dueDate: true,
      completedAt: true,
      course: { select: { id: true, title: true } },
    },
  });

  let completed = 0;
  let overdue = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let passedCount = 0;
  let finishedWithVerdict = 0; // completed з відомим passed (не null) — знаменник для passRate
  let onTime = 0;
  // Знаменник для onTimeRate — ЗАВЕРШЕНІ з відомим dueDate + ПРОСТРОЧЕНІ
  // з відомим dueDate. Раніше рахувались лише завершені — прострочені
  // (за визначенням НЕ вчасно) взагалі не потрапляли в знаменник, тому
  // "Вчасно" могло показувати 100% одночасно з реальними простроченнями
  // в команді (знайдений користувачем баг). "Дедлайн вирішено" — і
  // складено вчасно, і прострочено — це два протилежні наслідки одного
  // dueDate, обидва мають враховуватись в одному знаменнику.
  let dueDateResolved = 0;
  const engagedEmployeeIds = new Set();
  const byCourse = new Map();

  for (const e of enrollments) {
    if (e.status === "completed") {
      completed += 1;
      if (typeof e.scorePercent === "number") {
        scoreSum += e.scorePercent;
        scoreCount += 1;
      }
      if (e.passed != null) {
        finishedWithVerdict += 1;
        if (e.passed) passedCount += 1;
      }
      if (e.dueDate) {
        dueDateResolved += 1;
        if (e.completedAt && new Date(e.completedAt) <= new Date(e.dueDate)) onTime += 1;
      }
    } else if (e.status === "overdue") {
      overdue += 1;
      if (e.dueDate) dueDateResolved += 1;
    }
    if (e.status !== "not_started") engagedEmployeeIds.add(e.employeeId);

    const courseEntry = byCourse.get(e.course.id) || { title: e.course.title, total: 0, completed: 0 };
    courseEntry.total += 1;
    if (e.status === "completed") courseEntry.completed += 1;
    byCourse.set(e.course.id, courseEntry);
  }

  const courseBreakdown = Array.from(byCourse.values())
    .map((c) => ({ title: c.title, total: c.total, completed: c.completed, pct: c.total ? Math.round((c.completed / c.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, COURSE_BREAKDOWN_LIMIT);

  return {
    teamSize: employeeIds.length,
    completionRate: enrollments.length > 0 ? Math.round((completed / enrollments.length) * 100) : 0,
    avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    overdueCount: overdue,
    // "Складено" серед завершених — прохідний бал 80% (passed), відмінно
    // від completionRate (там completed рахує й "дійшов до кінця, не склав").
    passRate: finishedWithVerdict > 0 ? Math.round((passedCount / finishedWithVerdict) * 100) : 0,
    // Вчасність — завершив ДО dueDate серед завершених із відомим дедлайном.
    onTimeRate: dueDateResolved > 0 ? Math.round((onTime / dueDateResolved) * 100) : 0,
    // Залученість — частка команди, що хоч якось почала бодай один курс
    // (не лишила все на "не розпочато").
    engagementRate: employeeIds.length > 0 ? Math.round((engagedEmployeeIds.size / employeeIds.length) * 100) : 0,
    // Той самий показник, що engagementRate, але абсолютним числом людей
    // — KPI-плитка поруч із кільцем engagementRate% не повторює той
    // самий відсоток, а дає конкретний "скільком написати" список.
    noActivityCount: employeeIds.length - engagedEmployeeIds.size,
    courseBreakdown,
  };
}

/**
 * Дані для Excel-звіту (app/api/manager/export/route.js) — усе, що
 * реально зберігається в БД по видимій команді: призначення, кожна
 * спроба, кожен складений модуль. Питання/відповіді НЕ тягнемо — вони
 * ніде не зберігаються (Component.content — сама структура питання, а не
 * чиясь відповідь на нього; EnrollmentAttempt тримає лише підсумковий
 * scorePercent за спробу). Наймолодша деталізація, яка реально існує —
 * бал за МОДУЛЬ (ModuleCompletion), не за питання.
 *
 * @param {number[]} employeeIds
 */
export async function getExportData(employeeIds) {
  if (employeeIds.length === 0) {
    return { employees: [], enrollments: [], attempts: [], moduleCompletions: [] };
  }

  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: {
      id: true,
      name: true,
      externalCode: true,
      position: { select: { name: true } },
      territory: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  const enrollments = await prisma.enrollment.findMany({
    where: { employeeId: { in: employeeIds } },
    include: {
      employee: { select: { id: true, name: true, externalCode: true } },
      course: { select: { id: true, title: true } },
    },
    orderBy: [{ employeeId: "asc" }, { assignedAt: "asc" }],
  });

  const enrollmentIds = enrollments.map((e) => e.id);
  const [attempts, moduleCompletions] = enrollmentIds.length
    ? await Promise.all([
        prisma.enrollmentAttempt.findMany({
          where: { enrollmentId: { in: enrollmentIds } },
          orderBy: [{ enrollmentId: "asc" }, { completedAt: "asc" }],
        }),
        prisma.moduleCompletion.findMany({
          where: { enrollmentId: { in: enrollmentIds } },
          include: { module: { select: { title: true } } },
          orderBy: [{ enrollmentId: "asc" }, { completedAt: "asc" }],
        }),
      ])
    : [[], []];

  return { employees, enrollments, attempts, moduleCompletions };
}

const TREND_WEEKS = 6;

/**
 * Короткий тренд активності команди по тижнях — к-сть складених МОДУЛІВ
 * (ModuleCompletion.completedAt) за останні TREND_WEEKS тижнів. Свідомо
 * НЕ "знімок стану команди по тижнях" (це вимагало б окремої таблиці зі
 * знімками, яких зараз немає) — а реальна активність, порахована з уже
 * наявних дат завершення, без жодної нової інфраструктури чи міграції.
 *
 * @param {number[]} employeeIds
 */
export async function getWeeklyTrend(employeeIds) {
  if (employeeIds.length === 0) {
    return Array.from({ length: TREND_WEEKS }, (_, i) => ({
      label: i === TREND_WEEKS - 1 ? "Цей тиждень" : `-${TREND_WEEKS - 1 - i} тиж.`,
      count: 0,
      people: [],
    }));
  }

  const since = new Date();
  since.setDate(since.getDate() - TREND_WEEKS * 7);

  const completions = await prisma.moduleCompletion.findMany({
    where: { completedAt: { gte: since }, enrollment: { employeeId: { in: employeeIds } } },
    select: { completedAt: true, enrollment: { select: { employee: { select: { name: true } } } } },
  });

  const now = Date.now();
  const buckets = Array.from({ length: TREND_WEEKS }, () => 0);
  // Розбивка по людям — не окремий рядок на людину (перевантажило б
  // коротку картку), а перелік ІМЕН у підказці бару: хто саме склав
  // модуль того тижня, без нового рівня UI-складності.
  const peopleBuckets = Array.from({ length: TREND_WEEKS }, () => new Map());
  for (const c of completions) {
    const daysAgo = Math.floor((now - new Date(c.completedAt).getTime()) / (24 * 60 * 60 * 1000));
    const weekIndex = Math.floor(daysAgo / 7); // 0 = цей тиждень, 1 = минулий, ...
    if (weekIndex >= 0 && weekIndex < TREND_WEEKS) {
      const bucketIndex = TREND_WEEKS - 1 - weekIndex; // старіші зліва, цей тиждень справа
      buckets[bucketIndex] += 1;
      const name = c.enrollment.employee.name;
      const people = peopleBuckets[bucketIndex];
      people.set(name, (people.get(name) || 0) + 1);
    }
  }

  return buckets.map((count, i) => ({
    label: i === TREND_WEEKS - 1 ? "Цей тиждень" : `-${TREND_WEEKS - 1 - i} тиж.`,
    count,
    people: Array.from(peopleBuckets[i], ([name, modulesCount]) => ({ name, count: modulesCount })).sort(
      (a, b) => b.count - a.count
    ),
  }));
}
