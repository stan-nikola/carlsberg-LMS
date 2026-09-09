import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";
import { HubShell } from "@/components/HubShell";

// Гейт хаба: без валідної сесії — на реєстрацію (аналог перевірки
// telesale_profile_v1 в legacy js/main.js, тільки тепер на сервері,
// а не в клієнтському JS після завантаження сторінки).
export default async function HubLayout({ children }) {
  const employee = await getCurrentUser();
  if (!employee) {
    redirect("/register");
  }

  // isAdmin тут — лише щоб показати/сховати іконку-ярлик на /admin у
  // шапці; сам /admin захищений окремим паролем (lib/adminSession.js) і
  // не довіряє цій ролі напряму.
  return <HubShell isAdmin={hasFullAccess(employee)}>{children}</HubShell>;
}
