import { redirect } from "next/navigation";
import { getAdminLevel } from "@/lib/adminSession";
import { AdminShell } from "@/components/AdminShell";

// Гейт всего /admin, кроме /admin/login (тот вне этой route group —
// иначе сама форма логина редиректила бы сама на себя). Проверяет только
// /admin-сессию по паролю (lib/adminSession.js) — никак не связано с
// employee PIN-логином/сессией.
export default async function AdminProtectedLayout({ children }) {
  const level = await getAdminLevel();
  if (!level) {
    redirect("/admin/login");
  }

  return <AdminShell superAdmin={level === "super"}>{children}</AdminShell>;
}
