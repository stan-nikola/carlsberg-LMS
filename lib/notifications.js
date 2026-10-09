import { prisma } from "@/lib/prisma";
import { categoryOf, wantsCategory, wantsTelegramCategory, toManagerUrl } from "@/lib/notificationTypes";
import { sendPushToSubscriptions } from "@/lib/webPush";
import { sendTelegramToLinks } from "@/lib/telegram";
import { selectDeadlineReminders, deadlineReminderText, buildTeamDigest, dateKey } from "@/lib/notificationLogic";
import { isManagerTier } from "@/lib/permissions";
import { DAY_MS } from "@/lib/ukraineTime";

/**
 * Єдина точка входу для будь-якого сповіщення в платформі.
 *
 * notifyEmployees([...ids], {type, title, message, url, dedupeKey?})
 *   1. відкидає тих, хто вимкнув категорію цієї події (NotificationPreference);
 *   2. пише рядки Notification (центр сповіщень) — createMany +
 *      skipDuplicates по dedupeKey, тож повторний виклик безпечний;
 *   3. шле Web Push на всі підписки адресатів, у яких рядок реально
 *      створився (не дубль).
 *
 * Помилки push не піднімаються нагору: бізнес-дія (призначення, ачивка)
 * важливіша за доставку.
 */

/**
 * @param {number[]} employeeIds
 * @param {{type:string, title:string, message:string, url?:string|null, dedupeKey?:(id:number)=>string}} event
 *   dedupeKey — функція від employeeId, щоб ключ був унікальний на людину.
 * @returns {Promise<{created:number, pushed:number}>}
 */
export async function notifyEmployees(employeeIds, event) {
  const requested = Array.from(new Set(employeeIds)).filter(Boolean);
  if (requested.length === 0) return { created: 0, pushed: 0 };
  // Лише активні (2026-09-27, аудит L-11): деактивованим — і співробітникам,
  // і керівникам — нагадування й дайджести йшли далі, у т.ч. в особистий
  // Telegram людини, яка вже не працює в компанії.
  const ids = (
    await prisma.employee.findMany({ where: { id: { in: requested }, isActive: true }, select: { id: true } })
  ).map((e) => e.id);
  if (ids.length === 0) return { created: 0, pushed: 0 };

  // Посилання в /hub, надіслане керівнику, відкриває голий /manager —
  // app/hub/layout.js редіректить без розділу й query (2026-09-23).
  // Розводимо адресатів ОДИН раз тут, а не в кожній події окремо: так це
  // діє і на розсилки з /admin, і на cron-нагадування, і на push (він
  // бере той самий event.url нижче).
  if (event.url && (event.url === "/hub" || event.url.startsWith("/hub/") || event.url.startsWith("/hub?"))) {
    const { managers, others } = await splitByManagerTier(ids);
    if (managers.length > 0) {
      const [forManagers, forOthers] = await Promise.all([
        notifyEmployees(managers, { ...event, url: toManagerUrl(event.url) }),
        others.length > 0 ? notifyEmployees(others, event) : { created: 0, pushed: 0, telegram: 0 },
      ]);
      return {
        created: forManagers.created + forOthers.created,
        pushed: forManagers.pushed + forOthers.pushed,
        telegram: (forManagers.telegram || 0) + (forOthers.telegram || 0),
      };
    }
  }

  const category = categoryOf(event.type);
  const prefs = await prisma.notificationPreference.findMany({ where: { employeeId: { in: ids } } });
  const prefById = new Map(prefs.map((p) => [p.employeeId, p]));
  const recipients = ids.filter((id) => wantsCategory(prefById.get(id) || null, category));
  if (recipients.length === 0) return { created: 0, pushed: 0 };

  const rows = recipients.map((employeeId) => ({
    employeeId,
    type: event.type,
    category,
    title: event.title,
    message: event.message,
    url: event.url || null,
    dedupeKey: event.dedupeKey ? event.dedupeKey(employeeId) : null,
  }));

  const created = await prisma.notification.createManyAndReturn({
    data: rows,
    skipDuplicates: true,
    select: { employeeId: true },
  });
  if (created.length === 0) return { created: 0, pushed: 0 };

  // Канали доставки: за замовчуванням обидва; ручна розсилка може обрати
  // один (event.channels). Центр сповіщень — завжди.
  const channels = { push: event.channels?.push !== false, telegram: event.channels?.telegram !== false };
  const createdIds = created.map((n) => n.employeeId);

  let pushed = 0;
  if (channels.push) {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { employeeId: { in: createdIds } },
      select: { id: true, employeeId: true, endpoint: true, p256dh: true, auth: true },
    });
    const { sent } = await sendPushToSubscriptions(subscriptions, {
      title: event.title,
      body: event.message,
      url: event.url || "/hub/notifications",
      tag: event.type,
      category,
    });
    pushed = sent;
  }

  // Telegram — тим, хто прив’язав чат і не вимкнув цю категорію в своєму
  // окремому Telegram-списку (незалежному від Push-категорій вище).
  let telegram = 0;
  if (channels.telegram) {
    const tgIds = createdIds.filter((id) => wantsTelegramCategory(prefById.get(id) || null, category));
    if (tgIds.length > 0) {
      const links = await prisma.telegramLink.findMany({ where: { employeeId: { in: tgIds } }, select: { employeeId: true, chatId: true } });
      const r = await sendTelegramToLinks(links, { title: event.title, message: event.message, url: event.url || "/hub/notifications" });
      telegram = r.sent;
    }
  }

  return { created: created.length, pushed, telegram };
}

/**
 * Персональні сповіщення по одному (у кожного свій текст — ім'я підлеглого
 * тощо) — паралельно, але не більше `limit` одночасно: кожен виклик
 * notifyEmployees — кілька запитів до бази плюс HTTP до Web Push/Telegram, а
 * пул з'єднань — 10. До 2026-10-03 cron слав їх строго по черзі, і масове
 * прострочення (сотні людей) підходило до ліміту часу функції.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<{created?: number}>} fn
 * @returns {Promise<number>} сума created
 */
export async function notifyEachLimited(items, limit, fn) {
  let created = 0;
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      const res = await fn(item);
      created += res?.created || 0;
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return created;
}

/* ---------------- Конкретні події ---------------- */

/** Призначено курс — по одному сповіщенню на кожного, хто його щойно отримав. */
export async function notifyCourseAssigned(course, employeeIds) {
  return notifyEmployees(employeeIds, {
    type: "enrollment_assigned",
    title: "Вам призначено курс",
    message: `«${course.title}»${course.deadlineDays ? ` — термін ${course.deadlineDays} дн.` : ""}`,
    url: `/courses/${course.slug}`,
    dedupeKey: (id) => `assigned:${course.id}:${id}`,
  });
}

/**
 * Керівнику — підлеглий щойно завершив курс, успішно чи ні (2026-09-28,
 * рішення користувача). Миттєво, на відміну від team_digest нижче — той
 * самий факт лишається і в ньому: дайджест навмисно НЕ звужено, лишається
 * повним щоденним підсумком, а не "тільки те, що не пішло миттєво".
 * completedAt у dedupeKey — курс можна перескласти пізніше (провалив →
 * перескладає → склав), і це вже НОВА подія, а не дубль: без часової мітки
 * dedupeKey був би той самий для обох спроб і другий раз мовчки
 * проковтнувся б.
 */
export async function notifySubordinateCourseResult(managerId, { enrollmentId, employeeId, employeeName, courseTitle, passed, completedAt }) {
  if (!managerId) return { created: 0 };
  return notifyEmployees([managerId], {
    type: passed ? "subordinate_course_completed" : "subordinate_course_failed",
    title: passed ? "✅ Курс завершено" : "⚠️ Курс не складено",
    message: passed ? `${employeeName} завершив(ла) курс «${courseTitle}»` : `${employeeName} не склав(ла) курс «${courseTitle}»`,
    url: `/manager/team/${employeeId}`,
    dedupeKey: (id) => `subordinate-course:${enrollmentId}:${new Date(completedAt).toISOString()}:${id}`,
  });
}

/**
 * Керівний шар (SV і вище) взагалі не бачить /hub — app/hub/layout.js
 * мовчки перекидає будь-який запит туди на голий /manager, без збереження
 * шляху/query (2026-09-22: підсвітка відзнаки для керівника губилась саме
 * тут). Тож будь-яке сповіщення з посиланням у кабінет має розділити
 * адресатів: керівникам — /manager/…, решті — /hub/….
 * @param {number[]} employeeIds
 * @returns {Promise<{managers:number[], others:number[]}>}
 */
export async function splitByManagerTier(employeeIds) {
  const ids = Array.from(new Set(employeeIds));
  if (ids.length === 0) return { managers: [], others: [] };
  const employees = await prisma.employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, position: { select: { level: true } } },
  });
  const managerIds = new Set(employees.filter((e) => isManagerTier(e)).map((e) => e.id));
  return { managers: ids.filter((id) => managerIds.has(id)), others: ids.filter((id) => !managerIds.has(id)) };
}

/** Видано ачивку (авто чи вручну). */
export async function notifyBadgeAwarded(awards) {
  // awards: [{employeeId, badge:{id,title,icon}}] — по одному виклику на бейдж,
  // бо текст різний; кількість бейджів мала (одиниці).
  const byBadge = new Map();
  for (const a of awards) {
    if (!byBadge.has(a.badge.id)) byBadge.set(a.badge.id, { badge: a.badge, ids: [] });
    byBadge.get(a.badge.id).ids.push(a.employeeId);
  }

  // Керівнику окремим типом (2026-09-28) — той самий отримувач тут ще НЕ
  // знає власного managerId (a.employeeId — це нагороджений, а не той, хто
  // прийме сповіщення), тож підтягуємо разом ім'я+managerId одним запитом
  // на всіх нагороджених із цього виклику.
  const employeeIds = Array.from(new Set(awards.map((a) => a.employeeId)));
  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds } },
    select: { id: true, name: true, managerId: true },
  });
  const byId = new Map(employees.map((e) => [e.id, e]));

  let created = 0;
  for (const { badge, ids } of byBadge.values()) {
    // ?highlight=badge&badgeId=N — components/hub/BadgeGrid.tsx підсвітить і
    // проскролить саме до неї (2026-09-22, рішення користувача: той самий
    // прийом, що й підсвітка картки рейтингу). Керівникам адресу на
    // /manager/achievements підставить сам notifyEmployees — окремо
    // розводити адресатів тут більше не треба.
    const res = await notifyEmployees(ids, {
      type: "badge_awarded",
      title: `${badge.icon || "🏅"} Нова відзнака`,
      message: `Ви отримали «${badge.title}»`,
      url: `/hub/achievements?highlight=badge&badgeId=${badge.id}`,
      dedupeKey: (id) => `badge:${badge.id}:${id}`,
    });
    created += res.created;

    const withManager = ids.filter((employeeId) => byId.get(employeeId)?.managerId);
    await notifyEachLimited(withManager, 5, (employeeId) => {
      const employee = byId.get(employeeId);
      return notifyEmployees([employee.managerId], {
        type: "subordinate_badge_awarded",
        title: `${badge.icon || "🏅"} Відзнака підлеглого`,
        message: `${employee.name} отримав(ла) «${badge.title}»`,
        url: `/manager/team/${employeeId}`,
        dedupeKey: (id) => `subordinate-badge:${badge.id}:${employeeId}:${id}`,
      });
    });
  }
  return { created };
}

/**
 * Нагадування про дедлайни — з щоденного cron. Дивиться всі незавершені
 * призначення з майбутнім dueDate у межах 3 днів.
 */
export async function remindDeadlines(now = new Date()) {
  const horizon = new Date(now.getTime() + 3 * DAY_MS);
  const enrollments = await prisma.enrollment.findMany({
    // Не складено: не завершено АБО завершено з провалом (L-3). Лише активні (L-11).
    where: {
      dueDate: { gt: now, lte: horizon },
      employee: { isActive: true },
      OR: [{ status: { not: "completed" } }, { passed: false }],
    },
    include: { course: { select: { title: true, slug: true } } },
  });
  const reminders = selectDeadlineReminders(enrollments, now);
  // Однаковий текст (той самий курс, тип і днів до дедлайну) — одним викликом
  // на групу, а не по виклику на людину (аудит запитів, 2026-10-03). Ключ
  // дедуплікації лишається свій у кожного.
  const groups = new Map();
  for (const r of reminders) {
    const key = `${r.type}|${r.daysLeft}|${r.enrollment.course.slug}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  let created = 0;
  for (const group of groups.values()) {
    const [first] = group;
    const keyByEmployee = new Map(group.map((r) => [r.employeeId, r.dedupeKey]));
    const res = await notifyEmployees([...keyByEmployee.keys()], {
      type: first.type,
      title: "Наближається дедлайн",
      message: deadlineReminderText(first.daysLeft, first.enrollment.course.title),
      url: `/courses/${first.enrollment.course.slug}`,
      dedupeKey: (id) => keyByEmployee.get(id),
    });
    created += res.created;
  }
  return { candidates: reminders.length, created };
}

/**
 * Денний дайджест керівникам: що сталось у прямих підлеглих за минулу
 * добу (завершення, прострочення). Один рядок на керівника на дату.
 */
export async function sendTeamDigests(now = new Date()) {
  const since = new Date(now.getTime() - DAY_MS);
  const events = await prisma.enrollment.findMany({
    where: {
      OR: [
        { status: "completed", completedAt: { gte: since, lte: now } },
        // overdueAt, не updatedAt: будь-яка правка давно простроченого
        // призначення (корекція адміном) показувала його як «нове» (L-8).
        { status: "overdue", overdueAt: { gte: since, lte: now } },
      ],
      employee: { managerId: { not: null }, isActive: true },
    },
    select: {
      status: true,
      scorePercent: true,
      completedAt: true,
      employee: { select: { name: true, managerId: true } },
      course: { select: { title: true } },
    },
  });
  const byManager = new Map();
  for (const e of events) {
    const m = e.employee.managerId;
    if (!byManager.has(m)) byManager.set(m, []);
    byManager.get(m).push(e);
  }
  // ponytail: по виклику notifyEmployees на керівника (у кожного свій текст),
  // до 5 паралельно. Якщо cron усе одно впреться в ліміт Vercel — зібрати
  // prefs/підписки одним запитом на всіх і слати пачкою.
  const created = await notifyEachLimited([...byManager], 5, ([managerId, list]) => {
    const digest = buildTeamDigest(list);
    if (!digest) return null;
    return notifyEmployees([managerId], {
      type: "team_digest",
      title: digest.title,
      message: digest.message,
      url: "/manager",
      dedupeKey: (id) => `digest:${id}:${dateKey(now)}`,
    });
  });
  return { managers: byManager.size, created };
}

/**
 * Ручна розсилка з /admin. target: { all?:boolean, positionCodes?:string[],
 * territoryIds?:number[], employeeIds?:number[] } — той самий принцип
 * вибірки, що в lib/courseAssignment.js.
 */
export async function sendBroadcast({ title, message, url, target, channels }) {
  const ch = { push: channels?.push !== false, telegram: channels?.telegram !== false };
  const where = target.all
    ? { isActive: true }
    : {
        isActive: true,
        OR: [
          ...(target.positionCodes?.length ? [{ position: { code: { in: target.positionCodes } } }] : []),
          ...(target.territoryIds?.length ? [{ territoryId: { in: target.territoryIds } }] : []),
          ...(target.employeeIds?.length ? [{ id: { in: target.employeeIds } }] : []),
        ],
      };
  if (!target.all && where.OR.length === 0) throw new Error("Нема кому надсилати: вкажіть адресатів");

  const employees = await prisma.employee.findMany({ where, select: { id: true } });
  const broadcast = await prisma.broadcast.create({
    data: {
      title,
      message,
      url: url || null,
      targetSummary: describeTarget(target),
      sentCount: 0,
      channels: Object.keys(ch).filter((k) => ch[k]).join(","),
    },
  });
  const res = await notifyEmployees(
    employees.map((e) => e.id),
    { type: "broadcast", title, message, url: url || null, channels: ch, dedupeKey: (id) => `broadcast:${broadcast.id}:${id}` }
  );
  await prisma.broadcast.update({ where: { id: broadcast.id }, data: { sentCount: res.created, pushed: res.pushed, telegramSent: res.telegram } });
  return { broadcastId: broadcast.id, recipients: employees.length, created: res.created, pushed: res.pushed, telegram: res.telegram };
}

export function describeTarget(target) {
  if (target.all) return "Усі активні співробітники";
  const parts = [];
  if (target.positionCodes?.length) parts.push(`Посади: ${target.positionCodes.join(", ")}`);
  if (target.territoryIds?.length) parts.push(`Території: ${target.territoryIds.length}`);
  if (target.employeeIds?.length) parts.push(`Співробітники: ${target.employeeIds.length}`);
  return parts.join(" · ") || "—";
}
