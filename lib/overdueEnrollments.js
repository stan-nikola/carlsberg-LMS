import { prisma } from "@/lib/prisma";
import { notifyEmployees } from "@/lib/notifications";
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
 * Порядок на кожен рядок: спершу сповіщення (ідемпотентні — dedupeKey), потім
 * статус. Раніше статус міняли для всіх одразу, а сповіщали після — і якщо
 * функція падала посередині, решта людей так і не дізнавалась про
 * прострочення: наступний запуск їх уже не бачив (аудит логіки, L-8).
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
    include: { employee: true, course: true },
  });

  let notifiedCount = 0;
  for (const enrollment of newlyOverdue) {
    const deadline = formatKyivDate(enrollment.dueDate);
    const own = await notifyEmployees([enrollment.employeeId], {
      type: "enrollment_overdue",
      title: "Термін минув",
      message: `Курс «${enrollment.course.title}» прострочено (дедлайн був ${deadline}). Пройдіть його якнайшвидше.`,
      url: `/courses/${enrollment.course.slug}`,
      dedupeKey: () => `overdue:${enrollment.id}`,
    });
    notifiedCount += own.created;

    if (enrollment.employee.managerId) {
      const mgr = await notifyEmployees([enrollment.employee.managerId], {
        type: "subordinate_enrollment_overdue",
        title: "Прострочення в команді",
        message: `У ${enrollment.employee.name} прострочено курс «${enrollment.course.title}» (дедлайн був ${deadline}).`,
        url: "/manager",
        dedupeKey: () => `overdue:${enrollment.id}:manager`,
      });
      notifiedCount += mgr.created;
    }

    await prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: "overdue", overdueAt: now } });
  }

  return { markedCount: newlyOverdue.length, notifiedCount };
}
