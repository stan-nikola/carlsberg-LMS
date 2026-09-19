import { Suspense } from "react";
import { AdminEmployees } from "@/components/AdminEmployees";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Suspense — бо AdminEmployees читає useSearchParams (?id=… — відкрита в
// бічній панелі картка, щоб посилання на неї можна було передати) — Next.js вимагає
// межу Suspense навколо будь-якого клієнтського компонента з
// useSearchParams, інакше build падає з попередженням/помилкою.
export default function AdminEmployeesPage() {
  return (
    <Suspense fallback={null}>
      <AdminEmployees />
    </Suspense>
  );
}
