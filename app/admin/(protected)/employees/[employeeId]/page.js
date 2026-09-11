import { EmployeeDetail } from "@/components/EmployeeDetail";

// Гейт доступу — на рівні app/admin/(protected)/layout.js, як і у
// courses/[courseId]/page.js.
export default async function AdminEmployeeDetailPage({ params }) {
  const { employeeId } = await params;
  return <EmployeeDetail employeeId={Number(employeeId)} />;
}
