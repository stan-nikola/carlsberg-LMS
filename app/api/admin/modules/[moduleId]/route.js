import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// PATCH /api/admin/modules/:moduleId — { title?, order? }
export async function PATCH(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { moduleId } = await params;
  const body = await request.json();
  const data = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.order !== undefined) data.order = body.order;
  if (body.unlockAfterDays !== undefined) data.unlockAfterDays = body.unlockAfterDays;

  const updated = await prisma.module.update({ where: { id: Number(moduleId) }, data });
  return NextResponse.json(updated);
}

// DELETE /api/admin/modules/:moduleId (каскадно видаляє його уроки)
export async function DELETE(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { moduleId } = await params;
  await prisma.module.delete({ where: { id: Number(moduleId) } });
  return NextResponse.json({ ok: true });
}
