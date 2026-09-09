import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/positions — для дропдауна "кому призначати" в /admin.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const positions = await prisma.position.findMany({ orderBy: { level: "asc" } });
  return NextResponse.json(positions);
}
