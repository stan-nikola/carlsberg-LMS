import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

const LIMIT = 200;

/** GET /api/admin/audit?targetType=&q= — останні записи журналу дій. */
export async function GET(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get("targetType") || undefined;
  const q = searchParams.get("q")?.trim();
  const where = { targetType };
  if (q) where.action = { contains: q, mode: "insensitive" };
  const entries = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: LIMIT });
  const types = await prisma.auditLog.findMany({ distinct: ["targetType"], select: { targetType: true } });
  return NextResponse.json({ entries, types: types.map((t) => t.targetType), limit: LIMIT });
}
