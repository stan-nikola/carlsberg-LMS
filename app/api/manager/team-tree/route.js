import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";
import { getManagerTeamTree } from "@/lib/managerOverview";

// GET /api/manager/team-tree — дерево команди ОКРЕМО від /api/manager/overview
// (аудит "вообще без скелетонов мгновенно", 2026-09-20): найважчий за
// рендер-ціною блок сторінки ("Детально по команді", + peopleStatus/
// teamCompare, якщо керівник їх увімкнув) — ManagerDashboard.jsx тягне
// сюди лише коли ця секція реально потрібна (IntersectionObserver або
// одразу для увімкнених карток), а не завжди разом з рештою /manager.
export async function GET() {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerTier(employee)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tree = await getManagerTeamTree(employee.id);
  return NextResponse.json({ tree });
}
