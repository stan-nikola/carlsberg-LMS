import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// POST /api/admin/modules — { blockId, title, order }
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { blockId, title, order } = await request.json();
  const createdModule = await prisma.module.create({
    data: { blockId: Number(blockId), title, order: order ?? 0 },
    include: { lessons: true },
  });
  return NextResponse.json(createdModule, { status: 201 });
}
