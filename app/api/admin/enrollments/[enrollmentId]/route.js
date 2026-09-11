import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = ["not_started", "in_progress", "completed", "overdue"];

// PATCH /api/admin/enrollments/:enrollmentId — Фаза D, ручна корекція
// проходження курсу конкретною людиною (напр. "пройшов офлайн, збій
// синхронізації"). adminNote ОБОВ'ЯЗКОВИЙ — аудит-слід, чому саме
// відкориговано, щоб пізніше було видно, що це не реальний результат
// проходження, а ручне втручання.
export async function PATCH(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { enrollmentId } = await params;
  const body = await request.json();

  const adminNote = String(body.adminNote || "").trim();
  if (!adminNote) {
    return NextResponse.json({ error: "adminNote is required — поясніть причину ручної корекції" }, { status: 400 });
  }

  const data = { adminNote };
  if ("status" in body) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }
    data.status = body.status;
  }
  if ("scorePercent" in body) data.scorePercent = body.scorePercent === "" ? null : Number(body.scorePercent);
  if ("passed" in body) data.passed = body.passed;
  if ("completedAt" in body) data.completedAt = body.completedAt ? new Date(body.completedAt) : null;
  if ("dueDate" in body) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const updated = await prisma.enrollment.update({
    where: { id: Number(enrollmentId) },
    data,
    select: {
      id: true,
      status: true,
      scorePercent: true,
      passed: true,
      completedAt: true,
      dueDate: true,
      adminNote: true,
      course: { select: { title: true } },
    },
  });
  return NextResponse.json(updated);
}

// DELETE /api/admin/enrollments/:enrollmentId — зняти призначення з ОДНІЄЇ
// людини (гранулярна версія вже існуючого масового
// DELETE /api/admin/courses/:courseId/enrollments, той самий принцип).
export async function DELETE(request, { params }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { enrollmentId } = await params;
  await prisma.enrollment.delete({ where: { id: Number(enrollmentId) } });
  return NextResponse.json({ ok: true });
}
