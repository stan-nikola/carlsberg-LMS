import { notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/adminSession";
import { DesignStand } from "@/components/DesignStand";

// Лише супер-адмін (SUPER_ADMIN_PASSWORD): звичайній адмін-сесії — 404,
// пункт «Дизайн» у навігації їй і так не показується (AdminShell).
export default async function AdminDesignPage() {
  if (!(await isSuperAdmin())) notFound();
  return <DesignStand />;
}
