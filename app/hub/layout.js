import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { hasFullAccess, isManagerTier } from "@/lib/permissions";
import { HubShell } from "@/components/HubShell";

// Гейт хаба: без валідної сесії — на реєстрацію (аналог перевірки
// telesale_profile_v1 в legacy js/main.js, тільки тепер на сервері,
// а не в клієнтському JS після завантаження сторінки).
export default async function HubLayout({ children }) {
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
