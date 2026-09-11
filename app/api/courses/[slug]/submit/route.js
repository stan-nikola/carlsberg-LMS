import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

/**
 * POST /api/courses/:slug/submit
 * Body: { enrollmentId, startedAt, completedAt, durationSeconds,
 *         activeTimeSeconds, scoreRaw, scoreMax, scorePercent, passed,
 *         lastModule: { moduleId, scorePercent, passed, longestCorrectStreak } | null }
 *
 * Заміняє legacy queueResultAndSend() у Google Таблицю: оновлює зведення
 * в Enrollment (для швидких карток/звітів) і додає рядок в
 * EnrollmentAttempt (повна історія спроб).
 *
 * lastModule записується В ОДНІЙ транзакції разом із завершенням курсу —
 * раніше це були два незалежні запити "паралельно, не блокуючи один
 * одного" (components/CoursePlayer.jsx), і якщо один із них не долітав, а
 * другий встигав, курс міг позначитись "завершено" з певним балом, поки
 * останній модуль лишався зовсім без запису про проходження — реальний
 * розсинхрон, знайдений користувачем. Атомарна транзакція унеможливлює
 * цей стан: записується або все разом, або нічого.
 *
 * longestCorrectStreak на самому Enrollment/EnrollmentAttempt поки завжди
 * 0 — streak-механіку на рівні курсу в цілому (MVP-рішення) відклали
 * разом з акордеонами/gate/конфеті; на рівні МОДУЛЯ (lastModule.longestCorrectStreak
 * і ModuleCompletion.longestCorrectStreak за той самий модуль з чекпоінта
 * в goNext()) — рахується реально.
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
    lastModule,
  } = body;

  const enrollment = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!enrollment || enrollment.employeeId !== employee.id || enrollment.courseId !== course.id) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }

  if (lastModule) {
    const courseModule = await prisma.module.findUnique({ where: { id: Number(lastModule.moduleId) } });
    if (!courseModule || courseModule.courseId !== course.id) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }
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
    ...(lastModule
      ? [
          prisma.moduleCompletion.upsert({
            where: { enrollmentId_moduleId: { enrollmentId: enrollment.id, moduleId: Number(lastModule.moduleId) } },
            update: {
              scorePercent: lastModule.scorePercent,
              passed: lastModule.passed,
              longestCorrectStreak: lastModule.longestCorrectStreak,
              scoreRaw: lastModule.scoreRaw,
              scoreMax: lastModule.scoreMax,
              completedAt: new Date(completedAt),
            },
            create: {
              enrollmentId: enrollment.id,
              moduleId: Number(lastModule.moduleId),
              scorePercent: lastModule.scorePercent,
              passed: lastModule.passed,
              longestCorrectStreak: lastModule.longestCorrectStreak,
              scoreRaw: lastModule.scoreRaw,
              scoreMax: lastModule.scoreMax,
              completedAt: new Date(completedAt),
            },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true });
}
