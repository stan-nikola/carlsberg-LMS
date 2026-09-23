import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";
import { getHasNewCourses } from "@/lib/managerOverview";
import { ManagerShell } from "@/components/ManagerShell";
import { ManagerShellSkeleton } from "@/components/ManagerShellSkeleton";

// Дзеркало app/hub/layout.js в інший бік: без сесії — на реєстрацію; є
// сесія, але людина НЕ керівного рівня (SV..RM) — назад у звичайний /hub,
// а не показуємо їй порожній/чужий кабінет команди.
//
// Винесено під Suspense у окремий async-гейт (аудит "чорний екран на
// холодному старті", 2026-09-19) — той самий привід, що й у app/hub/
// layout.js, тільки тут ДВА послідовних запити (getCurrentUser +
// enrollment.findMany) блокували перший JSX, а не один.
async function ManagerGate({ children }) {
  const employee = await getCurrentUser();
  if (!employee) {
    redirect("/register");
  }
  if (!isManagerTier(employee)) {
    redirect("/hub");
  }

  // Маркер "нове" на "Курси" — той самий isRecentlyAssigned (lib/progress.js),
  // що вже дає бейдж "Нове" на картках курсів у /hub: суто за датою
  // призначення (assignedAt, ще не розпочато), без окремої таблиці
  // "прочитано/непрочитано".
  //
  // Рахується в кеш-межі (getHasNewCourses, lib/managerOverview.js), а не
  // тут: isRecentlyAssigned читає поточний час, а це в рендері Server
  // Component під Cache Components заборонено — помилка E1432 зривала
  // гідратацію всього /manager (2026-09-23).
  const hasNewCourses = await getHasNewCourses(employee.id);

  return (
    <ManagerShell hasNewCourses={hasNewCourses}>
      {children}
    </ManagerShell>
  );
}

export default function ManagerLayout({ children }) {
  return (
    <Suspense fallback={<ManagerShellSkeleton />}>
      <ManagerGate>{children}</ManagerGate>
    </Suspense>
  );
}
