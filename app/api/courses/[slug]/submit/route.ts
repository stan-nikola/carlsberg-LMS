import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { finalizeEnrollment } from "@/lib/moduleAttempts";
import { invalidateEmployeeEnrollments } from "@/lib/employeeProgress";

/**
 * POST /api/courses/:slug/submit
 * Body: { enrollmentId }
 *
 * З 2026-09-27 курс закриває сам module-complete, щойно в кожного модуля є
 * результат. Цей роут лишився для запитів, що вже лежать в офлайн-черзі
 * старих версій плеєра: присланий бал/«складено» ІГНОРУЄТЬСЯ (саме він
 * дозволяв підробити 100% і сертифікат), підсумок рахується з результатів
 * модулів на сервері.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));

  const course = await prisma.course.findUnique({ where: { slug }, select: { id: true, title: true } });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  const enrollment = await prisma.enrollment.findUnique({ where: { id: Number(body.enrollmentId) } });
  if (!enrollment || enrollment.employeeId !== employee.id || enrollment.courseId !== course.id) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }

  const state = await finalizeEnrollment(enrollment.id, employee, course.title);
  if (!state) return NextResponse.json({ error: "Курс ще не пройдено повністю" }, { status: 409 });
  invalidateEmployeeEnrollments();
  return NextResponse.json({ ok: true, course: state });
}
