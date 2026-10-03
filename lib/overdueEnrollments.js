import { prisma } from "@/lib/prisma";
import { notifyEachLimited, notifyEmployees } from "@/lib/notifications";
import { formatKyivDate } from "@/lib/kyivTime";

/**
 * Раз в день (см. app/api/cron/check-overdue-enrollments/route.js):
 * находит Enrollment с истёкшим dueDate, который ещё не сдан, помечает его
 * status = "overdue" и уведомляет самого сотрудника и его
 * непосредственного руководителя (managerId) — через lib/notifications.js,
 * тобто рядок у центрі сповіщень + Web Push на пристрій.
 *
 * «Не сдан» — и не завершённый, и завершённый, но НЕ складений (L-3,
 * 2026-09-27): раніше провалений курс мав status "completed" і в прострочення
 * не потрапляв ніколи. Деактивованих не чіпаємо (L-11).
 *
 * Порядок на кожну групу: спершу сповіщення (ідемпотентні — dedupeKey), потім
 * статус. Раніше статус міняли для всіх одразу, а сповіщали після — і якщо
 * функція падала посередині, решта людей так і не дізнавалась про
 * прострочення: наступний запуск їх уже не бачив (аудит логіки, L-8).
 *
 * Групи — той самий курс і та сама дата дедлайну, тобто однаковий текст
 * (2026-10-03, аудит запитів): одне сповіщення на групу замість одного на
 * людину, керівникам (у кожного свій текст з ім'ям) — до 5 паралельно, статус
 * — одним updateMany. Раніше масове прострочення курсу (сотні людей) робило
 * тисячі запитів по черзі й підходило до ліміту часу cron.
 *
 * @returns {Promise<{ markedCount: number, notifiedCount: number }>}
 */
export async function markOverdueEnrollments() {
  const now = new Date();

  const newlyOverdue = await prisma.enrollment.findMany({
    where: {
      dueDate: { lt: now },
      employee: { isActive: true },
      OR: [{ status: { in: ["not_started", "in_progress"] } }, { status: "completed", passed: false }],
    },
    select: {
      id: true,
      employeeId: true,
      courseId: true,
      dueDate: true,
      employee: { select: { name: true, managerId: true } },
      course: { select: { title: true, slug: true } },
    },
  });

  const groups = new Map();
  for (const e of newlyOverdue) {
    const deadline = formatKyivDate(e.dueDate);
    const key = `${e.courseId}|${deadline}`;
    if (!groups.has(key)) groups.set(key, { deadline, rows: [] });
    groups.get(key).rows.push(e);
  }

  let notifiedCount = 0;
  for (const { deadline, rows } of groups.values()) {
    const { course } = rows[0];
    const enrollmentIdOf = new Map(rows.map((e) => [e.employeeId, e.id]));
    const own = await notifyEmployees([...enrollmentIdOf.keys()], {
      type: "enrollment_overdue",
      title: "Термін минув",
      message: `Курс «${course.title}» прострочено (дедлайн був ${deadline}). Пройдіть його якнайшвидше.`,
      url: `/courses/${course.slug}`,
      dedupeKey: (id) => `overdue:${enrollmentIdOf.get(id)}`,
    });
    notifiedCount += own.created;

    notifiedCount += await notifyEachLimited(
      rows.filter((e) => e.employee.managerId),
      5,
      (e) =>
        notifyEmployees([e.employee.managerId], {
          type: "subordinate_enrollment_overdue",
          title: "Прострочення в команді",
          message: `У ${e.employee.name} прострочено курс «${course.title}» (дедлайн був ${deadline}).`,
          url: "/manager",
          dedupeKey: () => `overdue:${e.id}:manager`,
        })
    );

    await prisma.enrollment.updateMany({ where: { id: { in: rows.map((e) => e.id) } }, data: { status: "overdue", overdueAt: now } });
  }

  return { markedCount: newlyOverdue.length, notifiedCount };
}
