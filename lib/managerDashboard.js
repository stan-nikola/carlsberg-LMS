import { prisma } from "@/lib/prisma";

const NODE_SELECT = {
  id: true,
  name: true,
  managerId: true,
  isActive: true,
  position: { select: { code: true, name: true, level: true } },
  territory: { select: { id: true, name: true } },
};

function toNode(employee) {
  return {
    id: employee.id,
    name: employee.name,
    managerId: employee.managerId,
    isActive: employee.isActive,
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
 * managerId === null повертає дерево ВСІЄЇ організації (корінь — усі
 * співробітники без керівника) — використовується редактором дерева в
 * /admin (components/EmployeeTree.jsx), на відміну від виклику з реальним
 * id керівника в /manager. Кожен вузол несе managerId/isActive (на
 * відміну від початкової версії, писаної лише для /manager, де це було не
 * потрібно) — редактору дерева треба знати поточного керівника для
 * drag-and-drop переприв'язки й позначати деактивованих.
 *
 * @param {number|null} managerId
 * @returns {Promise<Array<{id:number,name:string,managerId:number|null,isActive:boolean,position:object|null,territory:object|null,children:Array}>>}
 */
export async function getTeamTree(managerId) {
  const rootReports = await prisma.employee.findMany({
    where: { managerId },
    select: NODE_SELECT,
    orderBy: { name: "asc" },
  });
  const nodes = rootReports.map(toNode);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  let currentLevelIds = nodes.map((n) => n.id);
  while (currentLevelIds.length > 0) {
    const children = await prisma.employee.findMany({
      where: { managerId: { in: currentLevelIds } },
      select: NODE_SELECT,
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
    scoreMax: e.scoreMax,
    passed: e.passed,
    durationSeconds: e.durationSeconds,
    activeTimeSeconds: e.activeTimeSeconds,
    longestCorrectStreak: e.longestCorrectStreak,
    attempts: attemptsByEnrollment.get(e.id) || [],
    // Кожен модуль курсу зі своїм результатом (якщо вже пройдено) —
    // null-поля, коли модуля ще не торкались (не вигадуємо "нуль балів",
    // просто немає даних). scoreMax потрібен, щоб на UI показувати
    // 🎯-стрик лише коли він дійсно значний відносно к-сті питань
    // (components/ManagerDashboard.jsx), не лише "> 0".
    modules: e.course.modules.map((m) => {
      const completion = completionByEnrollmentAndModule.get(`${e.id}:${m.id}`);
      return {
        id: m.id,
        title: m.title,
        order: m.order,
        scorePercent: completion ? completion.scorePercent : null,
        scoreMax: completion ? completion.scoreMax : null,
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

// Скільки "найскладніших модулів" показувати. Модуль потрапляє в список
// лише якщо його реально хтось провалив — тому ліміт тут не про
// перевантаження екрана, а про те, що хвіст із одним провалом на модуль
// керівнику вже нічого не підказує.
const HARD_MODULES_LIMIT = 6;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Горизонт дедлайнів — єдиний блок дашборда, що дивиться ВПЕРЕД (решта
 * показників ретроспективні). Рахуються лише НЕзавершені призначення:
 * у завершеного дедлайн уже не має сенсу, він або встиг, або ні — це
 * міряє окремий onTimeRate.
 *
 * Прострочене визначається і по status==="overdue" (його проставляє
 * щоденний cron), і по самій даті — між запусками cron дедлайн може вже
 * минути, а статус ще лишатись not_started/in_progress, і такий рядок
 * мусить рахуватись простроченим, а не потрапляти в "до 7 днів".
 *
 * @param {{status:string,dueDate:Date|string|null}[]} enrollments
 * @param {Date} [now]
 */
export function bucketDeadlineHorizon(enrollments, now = new Date()) {
  const counts = { overdue: 0, week: 0, month: 0, later: 0, none: 0 };

  for (const e of enrollments) {
    if (e.status === "completed") continue;
    if (!e.dueDate) {
      counts.none += 1;
      continue;
    }
    const days = (new Date(e.dueDate).getTime() - now.getTime()) / DAY_MS;
    if (e.status === "overdue" || days < 0) counts.overdue += 1;
    else if (days <= 7) counts.week += 1;
    else if (days <= 30) counts.month += 1;
    else counts.later += 1;
  }

  // Підписи живуть тут, а не в компоненті, бо той самий розклад іде і в
  // Excel-звіт (app/api/manager/export/route.js) — два місця з власними
  // копіями підписів неминуче розійшлись би.
  return [
    { key: "overdue", label: "Прострочено", count: counts.overdue, alert: true },
    { key: "week", label: "До 7 днів", count: counts.week, alert: true },
    { key: "month", label: "7–30 днів", count: counts.month, alert: false },
    { key: "later", label: "Понад 30 днів", count: counts.later, alert: false },
    { key: "none", label: "Без дедлайну", count: counts.none, alert: false },
  ];
}

/**
 * Гістограма балів по завершених призначеннях. Середній бал сам по собі
 * приховує розкид: 86% — це може бути "вся команда рівно на 86" або
 * "половина на 100, половина ледь за порогом", і це різні управлінські
 * ситуації.
 *
 * Пороги тут — рівні відрізки шкали, а НЕ прохідний бал: той тепер
 * per-курс (Course.passThreshold), тож єдиної межі "склав/не склав", яку
 * можна було б намалювати на спільній гістограмі, не існує.
 *
 * @param {{status:string,scorePercent:number|null}[]} enrollments
 */
export function bucketScores(enrollments) {
  const counts = { lt60: 0, s60: 0, s80: 0, s90: 0, s100: 0 };

  for (const e of enrollments) {
    if (e.status !== "completed" || typeof e.scorePercent !== "number") continue;
    if (e.scorePercent < 60) counts.lt60 += 1;
    else if (e.scorePercent < 80) counts.s60 += 1;
    else if (e.scorePercent < 90) counts.s80 += 1;
    else if (e.scorePercent < 100) counts.s90 += 1;
    else counts.s100 += 1;
  }

  return [
    { key: "lt60", label: "до 60%", count: counts.lt60 },
    { key: "s60", label: "60–79%", count: counts.s60 },
    { key: "s80", label: "80–89%", count: counts.s80 },
    { key: "s90", label: "90–99%", count: counts.s90 },
    { key: "s100", label: "100%", count: counts.s100 },
  ];
}

/**
 * Найскладніші модулі — де команда реально провалюється. Це єдиний блок
 * дашборда, що доводить погану цифру до конкретної ТЕМИ, а не до людини
 * чи курсу цілком.
 *
 * ModuleCompletion унікальний по (enrollmentId, moduleId), тобто один
 * рядок = одна людина на одному модулі, і `total` тут — скільки людей
 * модуль проходило, а не скільки було спроб.
 *
 * Сортування — за АБСОЛЮТНОЮ кількістю провалів, а не за відсотком:
 * модуль "1 з 1 провалив" дав би 100% і витіснив би "5 з 8", хоча
 * діяти треба саме по другому. Відсоток лишається як тай-брейк.
 *
 * @param {{moduleId:number,passed:boolean,module:{title:string,course?:{title:string}|null}}[]} rows
 * @param {number} [limit]
 */
export function rankHardestModules(rows, limit = HARD_MODULES_LIMIT) {
  const byModule = new Map();

  for (const mc of rows) {
    const entry = byModule.get(mc.moduleId) || {
      title: mc.module.title,
      course: mc.module.course?.title || null,
      total: 0,
      failed: 0,
    };
    entry.total += 1;
    if (mc.passed === false) entry.failed += 1;
    byModule.set(mc.moduleId, entry);
  }

  return Array.from(byModule.values())
    .filter((m) => m.failed > 0)
    .map((m) => ({ ...m, pct: Math.round((m.failed / m.total) * 100) }))
    .sort((a, b) => b.failed - a.failed || b.pct - a.pct)
    .slice(0, limit);
}

/**
 * Складання з першої спроби (first-time pass rate). Показує, наскільки
 * матеріал зрозумілий із першого проходження — низький відсоток при
 * високому "Складено" означає, що команда бере курс не знанням, а
 * повторами.
 *
 * Знаменник — усі призначення, де є бодай одна спроба. Той, хто так і не
 * склав, теж сюди входить і знижує показник — це навмисно: інакше
 * метрика рахувалась би лише по успішних і завжди виглядала б краще за
 * реальність.
 *
 * @param {{enrollmentId:number,completedAt:Date|string,passed:boolean}[]} attempts
 */
export function computeFirstAttempt(attempts) {
  const firstByEnrollment = new Map();

  for (const a of attempts) {
    const prev = firstByEnrollment.get(a.enrollmentId);
    if (!prev || new Date(a.completedAt).getTime() < new Date(prev.completedAt).getTime()) {
      firstByEnrollment.set(a.enrollmentId, a);
    }
  }

  let passedFirst = 0;
  for (const a of firstByEnrollment.values()) {
    if (a.passed === true) passedFirst += 1;
  }

  const total = firstByEnrollment.size;
  return {
    total,
    passedFirst,
    retried: total - passedFirst,
    pct: total > 0 ? Math.round((passedFirst / total) * 100) : 0,
  };
}

/**
 * Час на проходження. Сам по собі "довго/швидко" не є добре чи погано —
 * цінність у КРАЙНОЩАХ: купка спроб у корзині "до 10 хв" на змістовному
 * курсі означає, що його прогортали, не читаючи, а хвіст "понад 40 хв" —
 * що матеріал важкий або незручно поданий.
 *
 * Поруч із розподілом віддаємо МЕДІАНУ, а не середнє: одна забута
 * відкритою вкладка на три години зсуває середнє так, що воно перестає
 * описувати команду, а медіана до цього стійка. activeTimeSeconds
 * ("у фокусі") — окремо: різниця між ним і загальним часом і є той самий
 * "відкрив і пішов".
 *
 * @param {{durationSeconds:number|null,activeTimeSeconds:number|null}[]} attempts
 */
export function bucketDurations(attempts) {
  const durations = [];
  const activeDurations = [];
  const counts = { lt10: 0, m10: 0, m20: 0, gt40: 0 };

  for (const a of attempts) {
    if (typeof a.durationSeconds !== "number" || a.durationSeconds <= 0) continue;
    durations.push(a.durationSeconds);
    if (typeof a.activeTimeSeconds === "number" && a.activeTimeSeconds > 0) {
      activeDurations.push(a.activeTimeSeconds);
    }
    const minutes = a.durationSeconds / 60;
    if (minutes < 10) counts.lt10 += 1;
    else if (minutes < 20) counts.m10 += 1;
    else if (minutes <= 40) counts.m20 += 1;
    else counts.gt40 += 1;
  }

  const median = (values) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
  };

  return {
    total: durations.length,
    medianSeconds: median(durations),
    medianActiveSeconds: median(activeDurations),
    buckets: [
      { key: "lt10", label: "до 10 хв", count: counts.lt10 },
      { key: "m10", label: "10–20 хв", count: counts.m10 },
      { key: "m20", label: "20–40 хв", count: counts.m20 },
      { key: "gt40", label: "понад 40 хв", count: counts.gt40 },
    ],
  };
}

/**
 * Агрегати для KPI-плиток і графіків дашборда. Один запит по призначеннях
 * усієї видимої команди + два додаткові по її ж enrollmentId — на рівні
 * модулів (де саме провалюються) і спроб (чи складають з першого разу),
 * бо ці два зрізи з самого Enrollment не виводяться.
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
      deadlineHorizon: bucketDeadlineHorizon([]),
      scoreDistribution: bucketScores([]),
      hardestModules: [],
      firstAttempt: computeFirstAttempt([]),
      durations: bucketDurations([]),
    };
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { employeeId: { in: employeeIds } },
    select: {
      id: true,
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
    // "completed" тут — НЕ "дійшов до кінця" (те, що вище рахує
    // completionRate/course-агностичний "Виконано"), а реально СКЛАВ:
    // status===completed І passed===true (кожен модуль курсу ≥
    // Course.passThreshold — per-курс поріг). Завершив, але провалив
    // (passed===false) у цей бар більше не рахується — інакше "% виконання
    // по курсу" показував би однакові 100% і для тих, хто реально склав, і
    // для тих, хто просто дійшов до кінця й не набрав поріг (саме це і
    // було репортом користувача — курс без жодного складеного не мав
    // показувати 8/8).
    if (e.status === "completed" && e.passed === true) courseEntry.completed += 1;
    byCourse.set(e.course.id, courseEntry);
  }

  // Два зрізи, яких немає в самому Enrollment: рівень модуля (де саме
  // провалюються) і історія спроб (чи склали з першого разу). Обидва —
  // по тих самих enrollmentId, що вже вибрані вище, тож зайвого обходу
  // команди не роблять.
  const enrollmentIds = enrollments.map((e) => e.id);
  const [moduleCompletions, attempts] = enrollmentIds.length
    ? await Promise.all([
        prisma.moduleCompletion.findMany({
          where: { enrollmentId: { in: enrollmentIds } },
          select: {
            moduleId: true,
            passed: true,
            module: { select: { title: true, course: { select: { title: true } } } },
          },
        }),
        prisma.enrollmentAttempt.findMany({
          where: { enrollmentId: { in: enrollmentIds } },
          select: {
            enrollmentId: true,
            completedAt: true,
            passed: true,
            durationSeconds: true,
            activeTimeSeconds: true,
          },
        }),
      ])
    : [[], []];

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
    deadlineHorizon: bucketDeadlineHorizon(enrollments),
    scoreDistribution: bucketScores(enrollments),
    hardestModules: rankHardestModules(moduleCompletions),
    firstAttempt: computeFirstAttempt(attempts),
    durations: bucketDurations(attempts),
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
