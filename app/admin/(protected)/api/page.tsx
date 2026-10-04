import { notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/adminSession";
import { ApiDocs } from "@/components/ApiDocs";

// TODO: Cache Components adoption — той самий опт-аут, що на сусідніх сторінках адмінки.
export const instant = false;

// Лише супер-адмін (розділ «Для розробника», як і «Дизайн»): звичайній
// адмін-сесії — 404, пункту в навігації вона й так не бачить (AdminShell).
export default async function AdminApiPage() {
  if (!(await isSuperAdmin())) notFound();
  return <ApiDocs />;
}
