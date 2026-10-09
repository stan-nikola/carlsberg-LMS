import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

// GET /api/admin/positions — для дропдауна "кому призначати" в /admin.
export async function GET() {
  const denied = await adminGuard();
  if (denied) return denied;

  const positions = await prisma.position.findMany({ orderBy: { level: "asc" } });
  return NextResponse.json(positions);
}
