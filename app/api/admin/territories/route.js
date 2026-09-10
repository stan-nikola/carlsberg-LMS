import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/territories — для пікера "кому призначати" (по
// території) у /admin (components/TerritoryPicker.jsx).
//
// territories: пласкі вузли з parentId — саме дерево (RM -> ASM -> SV) і
// відступи будує клієнт.
//
// employees: ВСІ співробітники разом із managerId — не лише прив'язка до
// території (territoryId), а й реальна лінія підпорядкування. Обидва
// зв'язки різні за природою: у СВ-листка дерева territoryId зазвичай дає
// РІВНО одну людину (самого СВ), а managerId цієї людини далі веде до
// ЇЇ підлеглих (ТП/Мерчендайзери), яких імпорт зміг впевнено прив'язати
// по territoryId лише до цілого RM-регіону, не до конкретного СВ-району
// (див. CLAUDE.md "ніколи не вигадувати дані"). Клієнт тому будує ДВА
// дерева з одного списку — по territoryId і по managerId — і "стикує" їх
// на листках: коли географія закінчилась, навігація продовжується по
// реальній оргструктурі.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [territories, employees] = await Promise.all([
    prisma.territory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, parentId: true } }),
    prisma.employee.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, territoryId: true, managerId: true, position: { select: { name: true } } },
    }),
  ]);

  return NextResponse.json({
    territories,
    employees: employees.map((e) => ({
      id: e.id,
      name: e.name,
      positionName: e.position?.name || null,
      territoryId: e.territoryId,
      managerId: e.managerId,
    })),
  });
}
