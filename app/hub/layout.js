import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { HubShell } from "@/components/HubShell";

// Гейт хаба: без валідної сесії — на реєстрацію (аналог перевірки
// telesale_profile_v1 в legacy js/main.js, тільки тепер на сервері,
// а не в клієнтському JS після завантаження сторінки).
export default async function HubLayout({ children }) {
  const employee = await getCurrentUser();
  if (!employee) {
    redirect("/register");
  }

  return <HubShell>{children}</HubShell>;
}
