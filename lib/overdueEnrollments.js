import { prisma } from "@/lib/prisma";

/**
 * Раз в день (см. app/api/cron/check-overdue-enrollments/route.js):
 * находит Enrollment с истёкшим dueDate и status не completed/overdue,
 * помечает их status = "overdue" и создаёт Notification самому сотруднику
 * и его непосредственному руководителю (managerId).
 *
 * status уже overdue исключается из выборки специально — иначе один и тот
 * же просроченный Enrollment уведомлял бы заново при каждом запуске.
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

  const notifications = newlyOverdue.flatMap((enrollment) => {
    const deadline = enrollment.dueDate.toISOString();
    const entries = [
      {
        employeeId: enrollment.employeeId,
        type: "enrollment_overdue",
        message: `Курс «${enrollment.course.title}» просрочен (дедлайн был ${deadline}).`,
      },
    ];

    if (enrollment.employee.managerId) {
      entries.push({
        employeeId: enrollment.employee.managerId,
        type: "subordinate_enrollment_overdue",
        message: `У сотрудника ${enrollment.employee.name} просрочен курс «${enrollment.course.title}» (дедлайн был ${deadline}).`,
      });
    }

    return entries;
  });

  await prisma.notification.createMany({ data: notifications });

  return { markedCount: newlyOverdue.length, notifiedCount: notifications.length };
}
