import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// POST /api/admin/screens — { moduleId, title, order }
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { moduleId, title, order } = await request.json();
  const screen = await prisma.screen.create({
    data: { moduleId: Number(moduleId), title, order: order ?? 0 },
    include: { components: true },
  });
  return NextResponse.json(screen, { status: 201 });
}
