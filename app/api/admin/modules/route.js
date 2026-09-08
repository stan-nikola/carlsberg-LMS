import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// POST /api/admin/modules — { courseId, title, order }
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { courseId, title, order } = await request.json();
  const createdModule = await prisma.module.create({
    data: { courseId: Number(courseId), title, order: order ?? 0 },
  });
  return NextResponse.json(createdModule, { status: 201 });
}
