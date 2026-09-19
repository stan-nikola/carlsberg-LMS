import { AdminDashboard } from "@/components/AdminDashboard";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Стартовий екран /admin — див. components/AdminDashboard.jsx (курси
// розгортаються списком блоків, створення курсу/блоку тут же).
export default function AdminDashboardPage() {
  return <AdminDashboard />;
}
