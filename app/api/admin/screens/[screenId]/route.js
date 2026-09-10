import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// PATCH /api/admin/screens/:screenId — { title?, order?, unlockAfterDays? }
export async function PATCH(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { screenId } = await params;
  const body = await request.json();
  const data = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.order !== undefined) data.order = body.order;
  if (body.unlockAfterDays !== undefined) data.unlockAfterDays = body.unlockAfterDays;

  const updated = await prisma.screen.update({ where: { id: Number(screenId) }, data });
  return NextResponse.json(updated);
}

// DELETE /api/admin/screens/:screenId (каскадно видаляє його компоненти)
export async function DELETE(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { screenId } = await params;
  await prisma.screen.delete({ where: { id: Number(screenId) } });
  return NextResponse.json({ ok: true });
}
