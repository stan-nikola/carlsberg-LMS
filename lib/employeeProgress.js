import { prisma } from "@/lib/prisma";

/**
 * Все назначения (Enrollment) сотрудника вместе с курсом — единственный
 * источник правды для хаба теперь БД, а не localStorage, как в legacy.
 */
export async function getEmployeeEnrollments(employeeId) {
  return prisma.enrollment.findMany({
    where: { employeeId },
    include: { course: true },
    orderBy: { assignedAt: "asc" },
  });
}
