import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// PATCH /api/admin/blocks/:blockId — { title?, order?, cooldownDays? }
export async function PATCH(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { blockId } = await params;
  const body = await request.json();
  const data = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.order !== undefined) data.order = body.order;
  if (body.cooldownDays !== undefined) data.cooldownDays = body.cooldownDays;

  const block = await prisma.block.update({ where: { id: Number(blockId) }, data });
  return NextResponse.json(block);
}

// DELETE /api/admin/blocks/:blockId (каскадно видаляє модулі й уроки в них)
export async function DELETE(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { blockId } = await params;
  await prisma.block.delete({ where: { id: Number(blockId) } });
  return NextResponse.json({ ok: true });
}
