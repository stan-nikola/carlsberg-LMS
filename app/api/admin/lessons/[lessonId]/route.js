import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// PATCH /api/admin/lessons/:lessonId — { title?, type?, order?, content? }
// Це і є "можливість редагування курсів окремо" з ШАГ 3: контент екрана
// (Lesson.content) міняється тут, без редеплою коду.
export async function PATCH(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { lessonId } = await params;
  const body = await request.json();
  const data = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.type !== undefined) data.type = body.type;
  if (body.order !== undefined) data.order = body.order;
  if (body.content !== undefined) data.content = body.content;

  const lesson = await prisma.lesson.update({ where: { id: Number(lessonId) }, data });
  return NextResponse.json(lesson);
}

// DELETE /api/admin/lessons/:lessonId
export async function DELETE(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { lessonId } = await params;
  await prisma.lesson.delete({ where: { id: Number(lessonId) } });
  return NextResponse.json({ ok: true });
}
