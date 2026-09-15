import { prisma } from "@/lib/prisma";
import { notifyEmployees } from "@/lib/notifications";

/**
 * Раз в день (см. app/api/cron/check-overdue-enrollments/route.js):
 * находит Enrollment с истёкшим dueDate и status не completed/overdue,
 * помечает их status = "overdue" и уведомляет самого сотрудника и его
 * непосредственного руководителя (managerId) — через lib/notifications.js,
 * тобто рядок у центрі сповіщень + Web Push на пристрій.
 *
 * status уже overdue исключается из выборки специально — иначе один и тот
 * же просроченный Enrollment уведомлял бы заново при каждом запуске;
 * dedupeKey на кожне сповіщення — друга лінія захисту.
 *
 * @returns {Promise<{ markedCount: number, notifiedCount: number }>}
 */
export async function markOverdueEnrollments() {
  const now = new Date();

  const newlyOverdue = await prisma.enrollment.findMany({
    where: {
      dueDate: { lt: now },
      status: { notIn: ["completed", "overdue"] },
    },
    include: { employee: true, course: true },
  });

  if (newlyOverdue.length === 0) {
    return { markedCount: 0, notifiedCount: 0 };
  }

  await prisma.enrollment.updateMany({
    where: { id: { in: newlyOverdue.map((e) => e.id) } },
    data: { status: "overdue" },
  });

  let notifiedCount = 0;
  for (const enrollment of newlyOverdue) {
    const deadline = enrollment.dueDate.toLocaleDateString("uk-UA");
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
  }

  return { markedCount: newlyOverdue.length, notifiedCount };
}
