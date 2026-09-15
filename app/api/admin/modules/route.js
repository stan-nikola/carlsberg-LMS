import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// POST /api/admin/modules — { courseId, title, order }
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { courseId, title, order } = await request.json();
  const courseModule = await prisma.module.create({
    data: { courseId: Number(courseId), title, order: order ?? 0 },
    include: { screens: { include: { components: true } } },
  });
  await audit("module.create", "course", courseModule.courseId, { moduleId: courseModule.id, title: courseModule.title });
  return NextResponse.json(courseModule, { status: 201 });
}
