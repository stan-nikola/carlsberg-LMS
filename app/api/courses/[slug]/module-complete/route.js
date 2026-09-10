import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

/**
 * POST /api/courses/:slug/module-complete
 * Body: { enrollmentId, moduleId, scorePercent, passed }
 *
 * Фіксує факт складання модуля (chunk курсу — див. Module.cooldownDays у
 * schema.prisma, "Пауза між модулями") — не плутати з /submit, той закриває
 * ВЕСЬ курс. Викликається з CoursePlayer щоразу, коли співробітник дійшов
 * до кінця модуля (не обов'язково успішно — passed=false теж записується,
 * щоб дати можливість побачити останню спробу; upsert, тому повторна
 * спроба того ж модуля перезаписує попередню, а не плодить дублі).
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
  const { enrollmentId, moduleId, scorePercent, passed } = body;

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || enrollment.employeeId !== employee.id || enrollment.courseId !== course.id) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }

  const courseModule = await prisma.module.findUnique({ where: { id: Number(moduleId) } });
  if (!courseModule || courseModule.courseId !== course.id) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  const completion = await prisma.moduleCompletion.upsert({
    where: { enrollmentId_moduleId: { enrollmentId: enrollment.id, moduleId: courseModule.id } },
    update: { scorePercent, passed, completedAt: new Date() },
    create: { enrollmentId: enrollment.id, moduleId: courseModule.id, scorePercent, passed },
  });

  return NextResponse.json(completion);
}
