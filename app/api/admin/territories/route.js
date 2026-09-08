import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/territories — для дропдауна "кому призначати" (по
// території) у /admin. Повертає пласким списком з parentId — сортування/
// відступи по ієрархії (RM -> ASM -> SV) робить клієнт.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const territories = await prisma.territory.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(territories);
}
