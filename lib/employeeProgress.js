import { prisma } from "@/lib/prisma";
import { getModuleStatusList } from "@/lib/courseContent";

/**
 * Все назначения (Enrollment) сотрудника вместе с курсом — единственный
 * источник правды для хаба теперь БД, а не localStorage, как в legacy.
 */
export async function getEmployeeEnrollments(employeeId) {
  const enrollments = await prisma.enrollment.findMany({
    where: { employeeId },
    include: {
      course: {
        include: {
          // _count.modules — щоб CourseTile міг показати "N модулів": курс
          // складається з модулів (Course -> Module -> Screen -> Component),
          // а на плоскому списку карток курсів це раніше ніяк не було видно
          // — кілька курсів з однаковим префіксом назви ("Технік розливного
          // обладнання: ...") виглядали як незалежні один від одного
          // пункти, хоча кожен сам по собі — повноцінний курс із власними
          // модулями.
          _count: { select: { modules: true } },
          // Повний список модулів — для акордеону CourseTile (клік по
          // курсу розгортає саме ЙОГО модулі, замість того, щоб усі модулі
          // всіх курсів виглядали одним суцільним рядом карток). screens з
          // лише к-стю компонентів (не весь контент) — щоб порахувати
          // orientировний час проходження (lib/courseContent.js
          // estimateModuleMinutes), не тягнучи важкий вміст модуля заради
          // самого лише числа.
          modules: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              order: true,
              cooldownDays: true,
              screens: { select: { _count: { select: { components: true } } } },
            },
          },
        },
      },
      moduleCompletions: true,
    },
    orderBy: { assignedAt: "asc" },
  });

  return enrollments.map((enrollment) => ({
    ...enrollment,
    course: { ...enrollment.course, modules: getModuleStatusList(enrollment.course, enrollment.moduleCompletions) },
  }));
}
