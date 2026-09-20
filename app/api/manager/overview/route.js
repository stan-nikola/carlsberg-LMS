import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier } from "@/lib/permissions";
import { getManagerOverview } from "@/lib/managerOverview";

// GET /api/manager/overview — той самий агрегат, що тепер рахується
// напряму в app/manager/page.js (Server Component, кешований через
// lib/managerOverview.js). Роут лишається окремо як стабільний JSON-
// ендпоінт про всяк випадок (зовнішні інтеграції, ручна перевірка) — сам
// ManagerDashboard.jsx більше НЕ ходить сюди на монтуванні (аудит
// "быстродействия не почувствовал", 2026-09-19: fetch() з клієнта в
// Route Handler не бере участі в client Router Cache, тож головний екран
// лишався найважчим навіть після кешування enrollments).
export async function GET() {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerTier(employee)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const overview = await getManagerOverview(employee.id, employee.positionId);
  return NextResponse.json({
    me: {
      id: employee.id,
      name: employee.name,
      externalCode: employee.externalCode,
      hasEmail: Boolean(employee.email),
      avatarUrl: employee.avatarUrl,
      levelLabel: overview.levelLabel,
      position: employee.position,
      enrollments: overview.enrollments,
    },
    team: overview.team,
  });
}
