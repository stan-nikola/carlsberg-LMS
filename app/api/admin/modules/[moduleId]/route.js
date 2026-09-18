import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";

// PATCH /api/admin/modules/:moduleId — { title?, order?, cooldownDays?,
// retakeCooldownDays?, questionPoolSize?, retryFreeAttempts?, retryCooldownHours? }
export async function PATCH(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { moduleId } = await params;
  const body = await request.json();
  const data = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.order !== undefined) data.order = body.order;
  if (body.cooldownDays !== undefined) data.cooldownDays = body.cooldownDays;
  if (body.retakeCooldownDays !== undefined) data.retakeCooldownDays = body.retakeCooldownDays;
  // null = «успадкувати з курсу» / «усі питання»; число — власне значення модуля.
  if (body.questionPoolSize !== undefined) data.questionPoolSize = body.questionPoolSize;
  if (body.retryFreeAttempts !== undefined) data.retryFreeAttempts = body.retryFreeAttempts;
  if (body.retryCooldownHours !== undefined) data.retryCooldownHours = body.retryCooldownHours;

  const courseModule = await prisma.module.update({ where: { id: Number(moduleId) }, data });
  return NextResponse.json(courseModule);
}

// DELETE /api/admin/modules/:moduleId (каскадно видаляє екрани й компоненти в них)
export async function DELETE(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { moduleId } = await params;
  const removed = await prisma.module.delete({ where: { id: Number(moduleId) } });
  await audit("module.delete", "course", removed.courseId, { moduleId: removed.id, title: removed.title });
  return NextResponse.json({ ok: true });
}
