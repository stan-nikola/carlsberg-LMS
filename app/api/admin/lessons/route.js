import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// POST /api/admin/lessons — { moduleId, title, type, order, content }
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { moduleId, title, type, order, content } = await request.json();
  const lesson = await prisma.lesson.create({
    data: {
      moduleId: Number(moduleId),
      title,
      type: type || "info",
      order: order ?? 0,
      content: content ?? {},
    },
  });
  return NextResponse.json(lesson, { status: 201 });
}
