import { Suspense } from "react";
import { AdminEmployees } from "@/components/AdminEmployees";

// Suspense — бо AdminEmployees читає useSearchParams (?view=tree, лінк із
// EmployeeDetail "Переглянути в дереві організації") — Next.js вимагає
// межу Suspense навколо будь-якого клієнтського компонента з
// useSearchParams, інакше build падає з попередженням/помилкою.
export default function AdminEmployeesPage() {
  return (
    <Suspense fallback={null}>
      <AdminEmployees />
    </Suspense>
  );
}
