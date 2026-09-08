import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

/**
 * POST /api/courses/:slug/submit
 * Body: { enrollmentId, startedAt, completedAt, durationSeconds,
 *         activeTimeSeconds, scoreRaw, scoreMax, scorePercent, passed }
 *
 * Заміняє legacy queueResultAndSend() у Google Таблицю: оновлює зведення
 * в Enrollment (для швидких карток/звітів) і додає рядок в
 * EnrollmentAttempt (повна історія спроб).
 *
 * longestCorrectStreak поки завжди 0 — streak-механіку (MVP-рішення)
 * відклали разом з акордеонами/gate/конфеті.
 */
export async function POST(request, { params }) {
  const { slug } = await params;
  const employee = await getCurrentUser();
  if (!employee) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const course = await prisma.course.findUnique({ where: { slug } });
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const body = await request.json();
  const {
    enrollmentId,
    startedAt,
    completedAt,
    durationSeconds,
    activeTimeSeconds,
    scoreRaw,
    scoreMax,
    scorePercent,
    passed,
  } = body;

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || enrollment.employeeId !== employee.id || enrollment.courseId !== course.id) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "completed",
        completedAt: new Date(completedAt),
        scoreRaw,
        scoreMax,
        scorePercent,
        passed,
        durationSeconds,
        activeTimeSeconds,
      },
    }),
    prisma.enrollmentAttempt.create({
      data: {
        enrollmentId: enrollment.id,
        startedAt: new Date(startedAt),
        completedAt: new Date(completedAt),
        durationSeconds,
        activeTimeSeconds,
        scoreRaw,
        scoreMax,
        scorePercent,
        passed,
        longestCorrectStreak: 0,
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
