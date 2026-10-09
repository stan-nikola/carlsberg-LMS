import { NextResponse } from "next/server";
import { requireManager } from "@/lib/session";
import { getManagerTeamTree } from "@/lib/managerOverview";

// GET /api/manager/team-tree — дерево команди для картки «Порівняння команд».
// Окремим запитом: ManagerDashboard.tsx тягне його, лише коли картка увімкнена
// й наближається до екрана, а не разом із рештою /manager.
export async function GET() {
  const { manager: employee, denied } = await requireManager();
  if (denied) return denied;

  const tree = await getManagerTeamTree(employee.id);
  return NextResponse.json({ tree });
}
