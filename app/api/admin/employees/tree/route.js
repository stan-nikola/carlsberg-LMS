import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { getTeamTree } from "@/lib/managerDashboard";

// GET /api/admin/employees/tree — дерево ВСІЄЇ організації (корінь —
// getTeamTree(null), тобто всі співробітники без керівника) для
// components/admin/EmployeeTree.jsx (Фаза A адмінки: редактор дерева
// підпорядкування, на відміну від /manager, де той самий getTeamTree
// викликається з реальним managerId конкретного керівника).
export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;

  const tree = await getTeamTree(null);
  return NextResponse.json({ tree });
}
