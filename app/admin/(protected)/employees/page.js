import { Suspense } from "react";
import { AdminEmployees } from "@/components/AdminEmployees";

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
