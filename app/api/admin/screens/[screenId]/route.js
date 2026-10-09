import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/adminAuth";

// PATCH /api/admin/screens/:screenId — { title?, order? }
export async function PATCH(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { screenId } = await params;
  const body = await request.json().catch(() => ({}));
  const data = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.order !== undefined) data.order = body.order;

  const updated = await prisma.screen.update({ where: { id: Number(screenId) }, data });
  return NextResponse.json(updated);
}

// DELETE /api/admin/screens/:screenId (каскадно видаляє його компоненти)
export async function DELETE(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { screenId } = await params;
  await prisma.screen.delete({ where: { id: Number(screenId) } });
  return NextResponse.json({ ok: true });
}
