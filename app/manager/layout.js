import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isRecentlyAssigned } from "@/lib/progress";
import { ManagerShell } from "@/components/ManagerShell";

// Дзеркало app/hub/layout.js в інший бік: без сесії — на реєстрацію; є
// сесія, але людина НЕ керівного рівня (SV..RM) — назад у звичайний /hub,
// а не показуємо їй порожній/чужий кабінет команди.
export default async function ManagerLayout({ children }) {
  const employee = await getCurrentUser();
  if (!employee) {
    redirect("/register");
  }
  if (!isManagerTier(employee)) {
    redirect("/hub");
  }

  // Маркер "нове" на бургер-меню й на "Курси" — той самий isRecentlyAssigned
  // (lib/progress.js), що вже дає бейдж "Нове" на картках курсів у /hub:
  // суто за датою призначення (assignedAt, ще не розпочато), без окремої
  // таблиці "прочитано/непрочитано" — керівник теж Employee зі своїми
  // enrollments, той самий сигнал підходить без змін.
  //
  // Раніше тут стояв getEmployeeEnrollments(employee.id) — повне дерево
  // курс→модулі→екрани+лічильники+завершення модулів, побудоване для
  // самого хаба навчання, заради ОДНОГО булевого прапорця (аудит
  // швидкодії, 2026-09-19: цей layout виконується на КОЖЕН перехід між
  // вкладками /manager, не лише раз). select — лише два поля, яких
  // реально потребує isRecentlyAssigned.
  const myEnrollments = await prisma.enrollment.findMany({
    where: { employeeId: employee.id },
    select: { assignedAt: true, status: true },
  });
  const hasNewCourses = myEnrollments.some((e) => isRecentlyAssigned(e));

  return (
    <ManagerShell employee={employee} hasNewCourses={hasNewCourses}>
      {children}
    </ManagerShell>
  );
}
