import { getCurrentUser } from "@/lib/session";
import { hasFullAccess } from "@/lib/permissions";

/**
 * Повертає поточного employee, якщо в нього hasFullAccess (admin/hr_manager),
 * інакше null — виклик відповідає за 403.
 */
export async function requireAdmin() {
  const employee = await getCurrentUser();
  if (!hasFullAccess(employee)) return null;
  return employee;
}
