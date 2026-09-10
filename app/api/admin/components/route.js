import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// POST /api/admin/components — { screenId, title, type, order, content }
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { screenId, title, type, order, content } = await request.json();
  const component = await prisma.component.create({
    data: {
      screenId: Number(screenId),
      title,
      type: type || "info",
      order: order ?? 0,
      content: content ?? {},
    },
  });
  return NextResponse.json(component, { status: 201 });
}
