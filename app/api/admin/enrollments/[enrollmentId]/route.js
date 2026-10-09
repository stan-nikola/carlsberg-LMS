import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { adminGuard } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { syncEnrollmentEvents } from "@/lib/rating";
import { endOfUkraineDayFromInput } from "@/lib/ukraineTime";
import { invalidateEmployeeEnrollments } from "@/lib/employeeProgress";
import { removeEnrollments } from "@/lib/courseAssignment";
import { DEFAULT_PASS_THRESHOLD } from "@/lib/grading";

const VALID_STATUSES = ["not_started", "in_progress", "completed", "overdue"];

// PATCH /api/admin/enrollments/:enrollmentId — Фаза D, ручна корекція
// проходження курсу конкретною людиною (напр. "пройшов офлайн, збій
// синхронізації"). adminNote ОБОВ'ЯЗКОВИЙ — аудит-слід, чому саме
// відкориговано, щоб пізніше було видно, що це не реальний результат
// проходження, а ручне втручання.
export async function PATCH(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { enrollmentId } = await params;
  const body = await request.json().catch(() => ({}));

  const adminNote = String(body.adminNote || "").trim();
  if (!adminNote) {
    return NextResponse.json({ error: "adminNote is required — поясніть причину ручної корекції" }, { status: 400 });
  }

  const current = await prisma.enrollment.findUnique({
    where: { id: Number(enrollmentId) },
    select: {
      status: true,
      scorePercent: true,
      firstPassedAt: true,
      course: { select: { passThreshold: true } },
      _count: { select: { moduleCompletions: true } },
    },
  });
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });

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
  // Дедлайн із форми («2026-10-01») — кінець цього дня за українським часом, а не 03:00
  // (lib/ukraineTime.ts): інакше курс ставав простроченим у сам день дедлайну.
  if ("dueDate" in body) data.dueDate = body.dueDate ? endOfUkraineDayFromInput(String(body.dueDate)) : null;

  // Дедлайн перенесли в майбутнє, а статус лишився «прострочено» (форма
  // шле поточний статус назад як є) — повертаємо справжній стан. Раніше
  // курс після продовження дедлайну висів простроченим назавжди (L-4).
  const statusAfter = data.status ?? current.status;
  const statusUnchanged = !("status" in body) || body.status === current.status;
  if (statusAfter === "overdue" && statusUnchanged && data.dueDate && data.dueDate.getTime() > Date.now()) {
    data.status = current._count.moduleCompletions > 0 ? "in_progress" : "not_started";
  }

  // «Зараховано вручну» без явного passed: форма його не шле, і курс на 100%
  // лишався з passed=null — без балів рейтингу й у списку активних, хоча
  // сертифікат видавався (L-5). Складено = бал не нижче порогу курсу.
  if (data.status === "completed" && !("passed" in body)) {
    const score = data.scorePercent ?? current.scorePercent;
    if (typeof score === "number") data.passed = score >= (current.course.passThreshold ?? DEFAULT_PASS_THRESHOLD);
  }
  if (data.passed === true && !current.firstPassedAt) data.firstPassedAt = data.completedAt ?? new Date();

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
  // Бали рейтингу дзеркалять стан enrollment (рішення користувача
  // 2026-09-19): зарахував курс вручну — бали з'явились, скинув статус —
  // зникли. Best-effort, як і в /submit: збій нарахування не має
  // відкочувати саму корекцію.
  let rating = null;
  try {
    rating = await syncEnrollmentEvents(updated.id);
  } catch (err) {
    console.warn("[rating] enrollment correction:", err?.message);
  }
  // Хаб співробітника кешує призначення — без цього корекцію людина бачила б
  // із затримкою до кінця кешу.
  invalidateEmployeeEnrollments();
  await audit("enrollment.update", "enrollment", enrollmentId, { course: updated.course.title, ...data, rating });
  return NextResponse.json({ ...updated, rating });
}

// DELETE /api/admin/enrollments/:enrollmentId — зняти призначення з ОДНІЄЇ
// людини (гранулярна версія вже існуючого масового
// DELETE /api/admin/courses/:courseId/enrollments, той самий принцип).
export async function DELETE(request, { params }) {
  const denied = await adminGuard();
  if (denied) return denied;

  const { enrollmentId } = await params;
  const { removedCount } = await removeEnrollments({ id: Number(enrollmentId) });
  if (removedCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await audit("enrollment.delete", "enrollment", enrollmentId);
  return NextResponse.json({ ok: true });
}
