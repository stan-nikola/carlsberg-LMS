import { EmployeeDetail } from "@/components/EmployeeDetail";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// Гейт доступу — на рівні app/admin/(protected)/layout.js, як і у
// courses/[courseId]/page.js.
export default async function AdminEmployeeDetailPage({ params }) {
  const { employeeId } = await params;
  return <EmployeeDetail employeeId={Number(employeeId)} />;
}
