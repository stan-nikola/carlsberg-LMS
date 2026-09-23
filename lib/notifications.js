import { prisma } from "@/lib/prisma";
import { categoryOf, wantsCategory, wantsTelegramCategory } from "@/lib/notificationTypes";
import { sendPushToSubscriptions } from "@/lib/webPush";
import { sendTelegramToLinks } from "@/lib/telegram";
import { selectDeadlineReminders, deadlineReminderText, buildTeamDigest, dateKey } from "@/lib/notificationLogic";
import { isManagerTier } from "@/lib/permissions";

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
  const ids = Array.from(new Set(employeeIds)).filter(Boolean);
  if (ids.length === 0) return { created: 0, pushed: 0 };

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
  const { managers } = await splitByManagerTier(awards.map((a) => a.employeeId));
  const managerIds = new Set(managers);

  let created = 0;
  for (const { badge, ids } of byBadge.values()) {
    // ?highlight=badge&badgeId=N — components/BadgeGrid.jsx підсвітить і
    // проскролить саме до неї (2026-09-22, рішення користувача: той самий
    // прийом, що й підсвітка картки рейтингу).
    const query = `?highlight=badge&badgeId=${badge.id}`;
    const base = {
      type: "badge_awarded",
      title: `${badge.icon || "🏅"} Нова відзнака`,
      message: `Ви отримали «${badge.title}»`,
      dedupeKey: (id) => `badge:${badge.id}:${id}`,
    };
    const managers = ids.filter((id) => managerIds.has(id));
    const employeesIds = ids.filter((id) => !managerIds.has(id));
    const [rManagers, rEmployees] = await Promise.all([
      managers.length ? notifyEmployees(managers, { ...base, url: `/manager/achievements${query}` }) : { created: 0 },
      employeesIds.length ? notifyEmployees(employeesIds, { ...base, url: `/hub/achievements${query}` }) : { created: 0 },
    ]);
    created += rManagers.created + rEmployees.created;
  }
  return { created };
}

/**
 * Нагадування про дедлайни — з щоденного cron. Дивиться всі незавершені
 * призначення з майбутнім dueDate у межах 3 днів.
 */
export async function remindDeadlines(now = new Date()) {
  const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const enrollments = await prisma.enrollment.findMany({
    where: { dueDate: { gt: now, lte: horizon }, status: { notIn: ["completed"] } },
    include: { course: { select: { title: true, slug: true } } },
  });
  const reminders = selectDeadlineReminders(enrollments, now);
  let created = 0;
  for (const r of reminders) {
    const res = await notifyEmployees([r.employeeId], {
      type: r.type,
      title: "Наближається дедлайн",
      message: deadlineReminderText(r.daysLeft, r.enrollment.course.title),
      url: `/courses/${r.enrollment.course.slug}`,
      dedupeKey: () => r.dedupeKey,
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
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const events = await prisma.enrollment.findMany({
    where: {
      OR: [
        { status: "completed", completedAt: { gte: since, lte: now } },
        { status: "overdue", updatedAt: { gte: since, lte: now } },
      ],
      employee: { managerId: { not: null } },
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
  // ponytail: послідовно по керівниках (3–4 запити на кожного, ~100 керівників
  // ≈ 15с на прогрітому сервері). Якщо cron упреться в ліміт Vercel —
  // зібрати prefs/підписки одним запитом на всіх і слати пачкою.
  let created = 0;
  for (const [managerId, list] of byManager) {
    const digest = buildTeamDigest(list);
    if (!digest) continue;
    const res = await notifyEmployees([managerId], {
      type: "team_digest",
      title: digest.title,
      message: digest.message,
      url: "/manager",
      dedupeKey: (id) => `digest:${id}:${dateKey(now)}`,
    });
    created += res.created;
  }
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
