import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminGuard } from "@/lib/adminAuth";

// PATCH /api/admin/components/:componentId — { title?, type?, order?, content? }
// Це і є "можливість редагування курсів окремо" з ШАГ 3: контент компонента
// (Component.content) міняється тут, без редеплою коду.
export async function PATCH(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { componentId } = await params;
  const body = await request.json().catch(() => ({}));
  const data = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.type !== undefined) data.type = body.type;
  if (body.order !== undefined) data.order = body.order;
  if (body.content !== undefined) data.content = body.content;

  const component = await prisma.component.update({ where: { id: Number(componentId) }, data });
  return NextResponse.json(component);
}

// DELETE /api/admin/components/:componentId
export async function DELETE(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { componentId } = await params;
  await prisma.component.delete({ where: { id: Number(componentId) } });
  return NextResponse.json({ ok: true });
}
