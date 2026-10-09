import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/adminAuth";

// POST /api/admin/components — { screenId, title, type, order, content }
export async function POST(request) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { screenId, title, type, order, content } = await request.json().catch(() => ({}));
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
