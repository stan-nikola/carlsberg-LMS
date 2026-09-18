import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { formatWait, resolveRetryRules, retryGate } from "@/lib/retryPolicy";

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
  const { enrollmentId, moduleId, scorePercent, passed, longestCorrectStreak, scoreRaw, scoreMax, answers, durationSeconds } = body;
  // Ціле невід'ємне число або null — довільний рядок/від'ємне з клієнта не
  // повинні псувати картку плану курсу (lib/coursePlan.ts очікує саме таке).
  const cleanDuration = Number.isInteger(durationSeconds) && durationSeconds >= 0 ? durationSeconds : null;

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
    update: {
      scorePercent,
      passed,
      longestCorrectStreak,
      scoreRaw,
      scoreMax,
      completedAt: new Date(),
      // Рядок перезаписується, тож без лічильника «склав з першого разу» і
      // «склав з п'ятого» виглядали б однаково (2026-09-17).
      attemptCount: { increment: 1 },
      durationSeconds: cleanDuration,
    },
    create: {
      enrollmentId: enrollment.id,
      moduleId: courseModule.id,
      scorePercent,
      passed,
      longestCorrectStreak,
      scoreRaw,
      scoreMax,
      durationSeconds: cleanDuration,
    },
  });

  // Відповіді по КОЖНОМУ питанню — з них автор курсу бачить частку
  // правильних на питання й розуміє, де питання погане, а де матеріал
  // (2026-09-17). Пишемо не upsert-ом, а новими рядками: кожна спроба
  // цінна для статистики. Best-effort — збій статистики не має зривати
  // залік модуля.
  if (Array.isArray(answers) && answers.length > 0) {
    try {
      const componentIds = answers.map((a) => Number(a.componentId)).filter(Number.isInteger);
      // Компонент має належати саме цьому модулю — інакше з клієнта можна
      // було б насипати статистики в чужі питання.
      const own = await prisma.component.findMany({
        where: { id: { in: componentIds }, screen: { moduleId: courseModule.id } },
        select: { id: true },
      });
      const allowed = new Set(own.map((c) => c.id));
      const rows = answers
        .filter((a) => allowed.has(Number(a.componentId)))
        .map((a) => ({
          enrollmentId: enrollment.id,
          componentId: Number(a.componentId),
          moduleId: courseModule.id,
          correct: a.correct === true,
          attemptNumber: completion.attemptCount,
        }));
      if (rows.length > 0) await prisma.questionAnswer.createMany({ data: rows });
    } catch (err) {
      console.warn("[question-stats]", err?.message);
    }
  }

  // Чи відкрита наступна спроба — рахуємо тут, бо саме тут відомий свіжий
  // attemptCount. Плеєр із цієї відповіді вирішує, показати кнопку
  // «спробувати ще раз» чи «наступна спроба через …».
  const gate = retryGate(completion, resolveRetryRules(course, courseModule));

  return NextResponse.json({
    ...completion,
    retry: {
      canRetryNow: gate.canRetryNow,
      attemptsLeft: gate.attemptsLeft,
      attemptsMade: gate.attemptsMade,
      nextAttemptAt: gate.nextAttemptAt ? gate.nextAttemptAt.toISOString() : null,
      waitLabel: gate.nextAttemptAt ? formatWait(gate.nextAttemptAt) : null,
    },
  });
}
