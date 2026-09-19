import { AdminDataPage } from "@/components/AdminDataPage";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Гейт доступу — app/admin/(protected)/layout.js, як і в решти сторінок.
export default function AdminDataRoute() {
  return <AdminDataPage />;
}
