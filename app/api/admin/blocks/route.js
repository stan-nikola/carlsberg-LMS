import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// POST /api/admin/blocks — { courseId, title, order }
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { courseId, title, order } = await request.json();
  const block = await prisma.block.create({
    data: { courseId: Number(courseId), title, order: order ?? 0 },
    include: { modules: { include: { lessons: true } } },
  });
  return NextResponse.json(block, { status: 201 });
}
