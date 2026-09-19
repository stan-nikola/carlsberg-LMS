import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { hasFullAccess, isManagerTier } from "@/lib/permissions";
import { HubShell } from "@/components/HubShell";
import { HubShellSkeleton } from "@/components/HubShellSkeleton";

// Гейт хаба: без валідної сесії — на реєстрацію (аналог перевірки
// telesale_profile_v1 в legacy js/main.js, тільки тепер на сервері,
// а не в клієнтському JS після завантаження сторінки).
//
// Винесено з самого HubLayout у окремий async-компонент під Suspense
// (аудит "чорний екран на холодному старті", 2026-09-19): layout.js раніше
// сам був async і чекав getCurrentUser() (cookies()+Prisma) ДО повернення
// будь-якого JSX — на холодному запуску встановленого PWA (щойно
// прокинулась Vercel-функція + Neon) це лишало екран порожнім на кілька
// секунд, і жоден loading.tsx не рятував: він оборачує лише page.js,
// не layout.js, що блокується вище нього.
async function HubGate({ children }) {
  const employee = await getCurrentUser();
  if (!employee) {
    redirect("/register");
  }

  // Керівний шар (SV і вище, до RM включно) не бачить мобільний хаб
  // узагалі — одразу десктопний кабінет команди /manager. Перевірка тут,
  // а не тільки в момент логіну (app/register/page.js), щоб і прямий
  // перехід на /hub (закладка, вручну набраний URL) теж перекидав.
  if (isManagerTier(employee)) {
    redirect("/manager");
  }

  // isAdmin тут — лише щоб показати/сховати іконку-ярлик на /admin у
  // шапці; сам /admin захищений окремим паролем (lib/adminSession.js) і
  // не довіряє цій ролі напряму.
  return <HubShell isAdmin={hasFullAccess(employee)}>{children}</HubShell>;
}

export default function HubLayout({ children }) {
  return (
    <Suspense fallback={<HubShellSkeleton />}>
      <HubGate>{children}</HubGate>
    </Suspense>
  );
}
