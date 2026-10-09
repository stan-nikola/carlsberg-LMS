import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/adminAuth";

// POST /api/admin/screens — { moduleId, title, order }
export async function POST(request) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { moduleId, title, order } = await request.json().catch(() => ({}));
  const screen = await prisma.screen.create({
    data: { moduleId: Number(moduleId), title, order: order ?? 0 },
    include: { components: true },
  });
  return NextResponse.json(screen, { status: 201 });
}
