import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

/**
 * POST /api/courses/:slug/block-complete
 * Body: { enrollmentId, blockId, scorePercent, passed }
 *
 * Фіксує факт складання блоку (chunk курсу — див. Block.cooldownDays у
 * schema.prisma, "Пауза між блоками") — не плутати з /submit, той закриває
 * ВЕСЬ курс. Викликається з CoursePlayer щоразу, коли співробітник дійшов
 * до кінця блоку (не обов'язково успішно — passed=false теж записується,
 * щоб дати можливість побачити останню спробу; upsert, тому повторна
 * спроба того ж блоку перезаписує попередню, а не плодить дублі).
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
  const { enrollmentId, blockId, scorePercent, passed } = body;

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || enrollment.employeeId !== employee.id || enrollment.courseId !== course.id) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }

  const block = await prisma.block.findUnique({ where: { id: Number(blockId) } });
  if (!block || block.courseId !== course.id) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  const completion = await prisma.blockCompletion.upsert({
    where: { enrollmentId_blockId: { enrollmentId: enrollment.id, blockId: block.id } },
    update: { scorePercent, passed, completedAt: new Date() },
    create: { enrollmentId: enrollment.id, blockId: block.id, scorePercent, passed },
  });

  return NextResponse.json(completion);
}
