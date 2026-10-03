import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { isScored } from "@/lib/componentTypes";
import { canStartModuleAttempt } from "@/lib/courseContent";
import { gradeResponse, publicContent, revealContent, seededRandom, type KeyOf } from "@/lib/grading";
import { formatWait, pickQuestionPool, poolSeed, resolveRetryRules, retryGate } from "@/lib/retryPolicy";
import { syncEnrollmentEvents } from "@/lib/rating";
import { invalidateEmployeeEnrollments } from "@/lib/employeeProgress";
import { notifySubordinateCourseResult } from "@/lib/notifications";

const prisma = prismaUntyped as PrismaClient;
type Tx = Prisma.TransactionClient;

/**
 * Спроби модулів із перевіркою на сервері (2026-09-27, аудит S-C1 / L-1 / L-2).
 *
 *  - Кожна відповідь перевіряється тут у момент відповіді (answerQuestion) і
 *    записується в AttemptAnswer; другий раз на те саме питання в цій спробі
 *    відповісти не можна — повертається вже записаний результат.
 *  - Спроба відкривається лише якщо модуль зараз справді можна проходити
 *    (порядок, пауза між модулями, гальмо перескладання) — та сама перевірка,
 *    що визначає сесію плеєра (canStartModuleAttempt).
 *  - Бал модуля рахує finishModuleAttempt лише з записаних відповідей і
 *    лише по питаннях пулу цієї спроби; присланий клієнтом бал не існує.
 *  - ModuleCompletion тримає НАЙКРАЩИЙ результат: спроба «покращити» 85%
 *    більше не може скасувати вже складений модуль і курс.
 *  - Курс закривається на сервері (finalizeEnrollment), щойно в кожного
 *    модуля є результат.
 */

// ---------------------------------------------------------------- ключі й пул

/** Непрозорі key елементів питання (варіанти, кроки, пари) — HMAC, щоб за key не вгадати правильний порядок. */
export function serverKeyOf(componentId: number): KeyOf {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return (kind, index) =>
    crypto.createHmac("sha256", secret).update(`grade:${componentId}:${kind}:${index}`).digest("base64url").slice(0, 12);
}

/** Порядок перемішаних кроків/пар — стабільний для людини (відновлення сесії не тасує заново). */
export function contentSeed(enrollmentId: number, componentId: number): string {
  return `content:${enrollmentId}:${componentId}`;
}

type ComponentLike = { id: number; type: string; content: unknown };
type ModuleWithContent = {
  id: number;
  questionPoolSize: number | null;
  screens: { components: ComponentLike[] }[];
};

/** Питання пулу цієї спроби — рівно ті, що показує плеєр (app/courses/[slug]/page.js). */
export function modulePool(courseModule: ModuleWithContent, enrollmentId: number, attemptNumber: number): Set<number> {
  const ids = courseModule.screens.flatMap((s) => s.components.filter(isScored).map((c) => c.id));
  return pickQuestionPool(ids, courseModule.questionPoolSize, seededRandom(poolSeed(enrollmentId, courseModule.id, attemptNumber)));
}

/** Компонент для плеєра: оцінюваний — без ключів відповідей. */
export function toPlayerComponent<C extends ComponentLike>(component: C, enrollmentId: number): C {
  if (!isScored(component)) return component;
  return {
    ...component,
    content: publicContent(component.type, component.content as Record<string, unknown>, serverKeyOf(component.id), contentSeed(enrollmentId, component.id)),
  };
}

/** Номер спроби, яку людина проходить ЗАРАЗ (відкрита або наступна). */
export async function currentAttemptNumbers(enrollmentId: number): Promise<Map<number, number>> {
  const [open, completions] = await Promise.all([
    prisma.moduleAttempt.findMany({ where: { enrollmentId, finishedAt: null }, select: { moduleId: true, attemptNumber: true } }),
    prisma.moduleCompletion.findMany({ where: { enrollmentId }, select: { moduleId: true, attemptCount: true } }),
  ]);
  const out = new Map<number, number>();
  for (const c of completions) out.set(c.moduleId, c.attemptCount + 1);
  for (const o of open) out.set(o.moduleId, o.attemptNumber);
  return out;
}

/** Уже дані відповіді відкритих спроб — плеєр показує їх після перезавантаження замість порожніх питань. */
export async function openAttemptAnswers(enrollmentId: number) {
  const rows = await prisma.attemptAnswer.findMany({
    where: { attempt: { enrollmentId, finishedAt: null } },
    select: { componentId: true, correct: true, response: true, component: { select: { type: true, content: true } } },
  });
  return Object.fromEntries(
    rows.map((r) => [
      r.componentId,
      { correct: r.correct, response: r.response, reveal: revealContent(r.component.type, r.component.content as Record<string, unknown>, serverKeyOf(r.componentId)) },
    ])
  );
}

// ------------------------------------------------------------- завантаження

const MODULE_SELECT = {
  id: true,
  title: true,
  order: true,
  courseId: true,
  cooldownDays: true,
  retakeCooldownDays: true,
  retryFreeAttempts: true,
  retryCooldownHours: true,
  questionPoolSize: true,
  screens: {
    orderBy: { order: "asc" },
    select: { components: { orderBy: { order: "asc" }, select: { id: true, type: true, content: true } } },
  },
} as const;

async function loadContext(employeeId: number, slug: string, enrollmentId: number, moduleId: number) {
  const course = await prisma.course.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      passThreshold: true,
      modulePauseDays: true,
      retryFreeAttempts: true,
      retryCooldownHours: true,
      modules: { orderBy: { order: "asc" }, select: MODULE_SELECT },
    },
  });
  if (!course) return { ok: false as const, message: "Course not found" };
  const enrollment = Number.isInteger(enrollmentId) ? await prisma.enrollment.findUnique({ where: { id: enrollmentId } }) : null;
  if (!enrollment || enrollment.employeeId !== employeeId || enrollment.courseId !== course.id) {
    return { ok: false as const, message: "Enrollment not found" };
  }
  const courseModule = course.modules.find((m) => m.id === Number(moduleId));
  if (!courseModule) return { ok: false as const, message: "Module not found" };
  return { ok: true as const, course, enrollment, courseModule };
}

type Ctx = Extract<Awaited<ReturnType<typeof loadContext>>, { ok: true }>;

/** Одна спроба на модуль за раз: паралельні запити (дві вкладки, повтор черги) чекають тут. */
async function lockModule(tx: Tx, enrollmentId: number, moduleId: number) {
  await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(${enrollmentId}::int, ${moduleId}::int)`;
}

const REASON_TEXT: Record<string, string> = {
  locked: "Модуль ще закритий: спершу складіть попередній або дочекайтесь паузи.",
  retry_cooldown: "Вільні спроби вичерпано — наступна відкриється пізніше.",
  retake_cooldown: "Перескласти модуль можна буде після паузи.",
  perfect: "Модуль уже складено на 100%.",
};

async function openAttempt(tx: Tx, ctx: Ctx) {
  const { course, enrollment, courseModule } = ctx;
  const open = await tx.moduleAttempt.findFirst({
    where: { enrollmentId: enrollment.id, moduleId: courseModule.id, finishedAt: null },
    orderBy: { id: "desc" },
  });
  if (open) return { attempt: open };
  const completions = await tx.moduleCompletion.findMany({ where: { enrollmentId: enrollment.id } });
  const byModule = new Map(completions.map((c) => [c.moduleId, c]));
  const gate = canStartModuleAttempt(course, courseModule, byModule);
  if (!gate.ok) return { blocked: gate.reason as string };
  const attempt = await tx.moduleAttempt.create({
    data: {
      enrollmentId: enrollment.id,
      moduleId: courseModule.id,
      attemptNumber: (byModule.get(courseModule.id)?.attemptCount ?? 0) + 1,
    },
  });
  return { attempt };
}

// ------------------------------------------------------------------ відповідь

export type AnswerResult =
  | { ok: true; correct: boolean; reveal: Record<string, unknown>; response: unknown; alreadyAnswered: boolean }
  | { ok: false; status: number; error: string };

export async function answerQuestion(
  employeeId: number,
  slug: string,
  body: { enrollmentId?: unknown; moduleId?: unknown; componentId?: unknown; response?: unknown }
): Promise<AnswerResult> {
  const ctx = await loadContext(employeeId, slug, Number(body.enrollmentId), Number(body.moduleId));
  if (!ctx.ok) return { ok: false, status: 404, error: ctx.message };
  const componentId = Number(body.componentId);
  const component = ctx.courseModule.screens.flatMap((s) => s.components).find((c) => c.id === componentId);
  if (!component || !isScored(component)) return { ok: false, status: 404, error: "Question not found" };
  if (body.response == null || typeof body.response !== "object") return { ok: false, status: 400, error: "response is required" };
  if (JSON.stringify(body.response).length > 4000) return { ok: false, status: 400, error: "response too large" };

  const keyOf = serverKeyOf(component.id);
  const content = component.content as Record<string, unknown>;
  const outcome = await prisma.$transaction(async (tx) => {
    await lockModule(tx, ctx.enrollment.id, ctx.courseModule.id);
    const opened = await openAttempt(tx, ctx);
    if ("blocked" in opened) return { blocked: opened.blocked };
    const attempt = opened.attempt;
    if (!modulePool(ctx.courseModule, ctx.enrollment.id, attempt.attemptNumber).has(component.id)) return { notInPool: true };
    const existing = await tx.attemptAnswer.findUnique({ where: { attemptId_componentId: { attemptId: attempt.id, componentId } } });
    if (existing) return { correct: existing.correct, response: existing.response, alreadyAnswered: true };
    const correct = gradeResponse(component.type, content, body.response, keyOf);
    await tx.attemptAnswer.create({
      data: { attemptId: attempt.id, componentId, response: body.response as Prisma.InputJsonValue, correct },
    });
    if (ctx.enrollment.status === "not_started") {
      await tx.enrollment.update({ where: { id: ctx.enrollment.id }, data: { status: "in_progress" } });
    }
    return { correct, response: body.response, alreadyAnswered: false };
  });

  if ("blocked" in outcome) return { ok: false, status: 409, error: REASON_TEXT[outcome.blocked!] ?? "Модуль зараз недоступний" };
  if ("notInPool" in outcome) return { ok: false, status: 409, error: "Це питання не входить у поточну спробу — оновіть сторінку." };
  return {
    ok: true,
    correct: outcome.correct,
    response: outcome.response,
    alreadyAnswered: outcome.alreadyAnswered,
    reveal: revealContent(component.type, content, keyOf),
  };
}

// ------------------------------------------------------------ завершення модуля

function longestStreak(ids: number[], correctById: Map<number, boolean>): number {
  let best = 0;
  let cur = 0;
  for (const id of ids) {
    cur = correctById.get(id) ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

export type FinishResult =
  | {
      ok: true;
      moduleId: number;
      attemptNumber: number;
      scoreRaw: number;
      scoreMax: number;
      scorePercent: number;
      passed: boolean;
      results: { componentId: number; correct: boolean }[];
      retry: { canRetryNow: boolean; attemptsLeft: number | null; attemptsMade: number; nextAttemptAt: string | null; waitLabel: string | null };
      course: CourseState | null;
    }
  | { ok: false; status: number; error: string };

const CLIENT_ATTEMPT_ID = /^[A-Za-z0-9-]{8,64}$/;

export async function finishModuleAttempt(
  employee: { id: number; name: string; manager?: { id: number } | null },
  slug: string,
  body: { enrollmentId?: unknown; moduleId?: unknown; clientAttemptId?: unknown; answers?: unknown; durationSeconds?: unknown }
): Promise<FinishResult> {
  const clientAttemptId = typeof body.clientAttemptId === "string" && CLIENT_ATTEMPT_ID.test(body.clientAttemptId) ? body.clientAttemptId : null;
  // Старий формат (бал від клієнта, без clientAttemptId) — відкидаємо: саме
  // він дозволяв «скласти» курс запитом із devtools. Офлайн-черга 4xx викидає.
  if (!clientAttemptId) return { ok: false, status: 400, error: "clientAttemptId is required" };

  const ctx = await loadContext(employee.id, slug, Number(body.enrollmentId), Number(body.moduleId));
  if (!ctx.ok) return { ok: false, status: 404, error: ctx.message };
  const { course, enrollment, courseModule } = ctx;
  const duration = Number.isInteger(body.durationSeconds) && (body.durationSeconds as number) >= 0 ? (body.durationSeconds as number) : null;
  const payloadAnswers = body.answers && typeof body.answers === "object" ? (body.answers as Record<string, unknown>) : {};
  const threshold = course.passThreshold ?? 80;

  const outcome = await prisma.$transaction(async (tx) => {
    await lockModule(tx, enrollment.id, courseModule.id);
    // Повтор того самого завершення (офлайн-черга, друга вкладка) — той самий результат, без нової спроби.
    const replay = await tx.moduleAttempt.findUnique({ where: { clientAttemptId }, include: { answers: true } });
    if (replay) {
      if (replay.enrollmentId !== enrollment.id || replay.moduleId !== courseModule.id) return { conflict: true };
      return { attempt: replay, answers: replay.answers, replayed: true };
    }
    const opened = await openAttempt(tx, ctx);
    if ("blocked" in opened) return { blocked: opened.blocked };
    const attempt = opened.attempt;
    const pool = modulePool(courseModule, enrollment.id, attempt.attemptNumber);
    const stored = await tx.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
    const answered = new Set(stored.map((a) => a.componentId));

    // Відповіді, дані без мережі (офлайн), — перевіряємо зараз. Лише питання пулу й лише ще не дані.
    const components = courseModule.screens.flatMap((s) => s.components);
    const fresh = components
      .filter((c) => pool.has(c.id) && !answered.has(c.id) && payloadAnswers[String(c.id)] != null)
      .map((c) => ({
        attemptId: attempt.id,
        componentId: c.id,
        response: payloadAnswers[String(c.id)] as Prisma.InputJsonValue,
        correct: gradeResponse(c.type, c.content as Record<string, unknown>, payloadAnswers[String(c.id)], serverKeyOf(c.id)),
      }));
    if (fresh.length) await tx.attemptAnswer.createMany({ data: fresh, skipDuplicates: true });
    const answers = [...stored, ...fresh];

    const orderedPool = components.filter((c) => pool.has(c.id)).map((c) => c.id);
    const correctById = new Map(answers.map((a) => [a.componentId, a.correct]));
    const scoreRaw = orderedPool.filter((id) => correctById.get(id)).length;
    const scoreMax = orderedPool.length;
    // Модуль без питань (лише матеріал) нікого не блокує — 100%.
    const scorePercent = scoreMax > 0 ? Math.round((scoreRaw / scoreMax) * 100) : 100;
    const passed = scorePercent >= threshold;
    const now = new Date();

    const finished = await tx.moduleAttempt.update({
      where: { id: attempt.id },
      data: { finishedAt: now, clientAttemptId, scoreRaw, scoreMax, scorePercent, passed },
    });

    // Найкращий результат перемагає: гірша спроба лише рахується (attemptCount,
    // lastAttemptAt — для гальма перескладання), але бал і «складено» не зменшує.
    const old = await tx.moduleCompletion.findUnique({
      where: { enrollmentId_moduleId: { enrollmentId: enrollment.id, moduleId: courseModule.id } },
    });
    const streak = longestStreak(orderedPool, correctById);
    const best = { scorePercent, passed, scoreRaw, scoreMax, longestCorrectStreak: streak, completedAt: now };
    if (!old) {
      await tx.moduleCompletion.create({
        data: {
          enrollmentId: enrollment.id,
          moduleId: courseModule.id,
          ...best,
          attemptCount: attempt.attemptNumber,
          lastAttemptAt: now,
          durationSeconds: duration,
          firstPassedAttempt: passed ? attempt.attemptNumber : null,
        },
      });
    } else {
      const better = (passed && !old.passed) || (passed === old.passed && scorePercent > old.scorePercent);
      await tx.moduleCompletion.update({
        where: { id: old.id },
        data: {
          ...(better ? best : {}),
          attemptCount: Math.max(old.attemptCount, attempt.attemptNumber),
          lastAttemptAt: now,
          durationSeconds: duration,
          ...(passed && !old.passed && old.firstPassedAttempt == null ? { firstPassedAttempt: attempt.attemptNumber } : {}),
        },
      });
    }

    // Аналітика складності питань (конструктор) — як і раніше, рядок на відповідь.
    if (answers.length) {
      await tx.questionAnswer.createMany({
        data: answers
          .filter((a) => pool.has(a.componentId))
          .map((a) => ({ enrollmentId: enrollment.id, componentId: a.componentId, moduleId: courseModule.id, correct: a.correct, attemptNumber: attempt.attemptNumber })),
      });
    }
    if (enrollment.status === "not_started") {
      await tx.enrollment.update({ where: { id: enrollment.id }, data: { status: "in_progress" } });
    }
    return { attempt: finished, answers, replayed: false };
  });

  if ("conflict" in outcome) return { ok: false, status: 409, error: "clientAttemptId belongs to another module" };
  if ("blocked" in outcome) return { ok: false, status: 409, error: REASON_TEXT[outcome.blocked!] ?? "Модуль зараз недоступний" };

  const { attempt } = outcome;
  const courseState = outcome.replayed ? await readCourseState(enrollment.id) : await finalizeEnrollment(enrollment.id, employee, course.title);
  invalidateEmployeeEnrollments();

  const completion = await prisma.moduleCompletion.findUnique({
    where: { enrollmentId_moduleId: { enrollmentId: enrollment.id, moduleId: courseModule.id } },
  });
  const gate = retryGate(completion, resolveRetryRules(course, courseModule));
  return {
    ok: true,
    moduleId: courseModule.id,
    attemptNumber: attempt.attemptNumber,
    scoreRaw: attempt.scoreRaw ?? 0,
    scoreMax: attempt.scoreMax ?? 0,
    scorePercent: attempt.scorePercent ?? 0,
    passed: attempt.passed === true,
    results: outcome.answers.map((a) => ({ componentId: a.componentId, correct: a.correct })),
    retry: {
      canRetryNow: gate.canRetryNow,
      attemptsLeft: gate.attemptsLeft,
      attemptsMade: gate.attemptsMade,
      nextAttemptAt: gate.nextAttemptAt ? gate.nextAttemptAt.toISOString() : null,
      waitLabel: gate.nextAttemptAt ? formatWait(gate.nextAttemptAt) : null,
    },
    course: courseState,
  };
}

// ------------------------------------------------------------------ курс

export type CourseState = { completed: boolean; scoreRaw: number; scoreMax: number; scorePercent: number; passed: boolean };

async function readCourseState(enrollmentId: number): Promise<CourseState | null> {
  const e = await prisma.enrollment.findUnique({ where: { id: enrollmentId } });
  if (!e || e.status !== "completed") return null;
  return { completed: true, scoreRaw: e.scoreRaw ?? 0, scoreMax: e.scoreMax ?? 0, scorePercent: e.scorePercent ?? 0, passed: e.passed === true };
}

/**
 * Курс закривається САМ, щойно в кожного модуля є результат (до цього бал і
 * «складено» курсу присилав браузер через /submit). Бал — сума найкращих
 * результатів модулів; складено — лише якщо складено КОЖЕН модуль.
 * Повторний виклик після перескладання оновлює підсумок.
 */
export async function finalizeEnrollment(
  enrollmentId: number,
  employee: { id: number; name: string; manager?: { id: number } | null },
  courseTitle: string,
  now = new Date()
): Promise<CourseState | null> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      moduleCompletions: true,
      course: {
        select: { modules: { select: { id: true, screens: { select: { components: { select: { type: true } } } } } } },
      },
    },
  });
  if (!enrollment) return null;
  const byModule = new Map(enrollment.moduleCompletions.map((c) => [c.moduleId, c]));
  const modules = enrollment.course.modules;
  if (modules.length === 0 || !modules.every((m) => byModule.has(m.id))) return null;

  let scoreRaw = 0;
  let scoreMax = 0;
  for (const m of modules) {
    const c = byModule.get(m.id)!;
    if (c.scoreRaw != null && c.scoreMax != null) {
      scoreRaw += c.scoreRaw;
      scoreMax += c.scoreMax;
    } else {
      // Рядок, записаний до появи scoreRaw/scoreMax — відновлюємо з відсотка
      // й реальної кількості оцінюваних питань модуля (як і раніше робила сторінка).
      const questions = m.screens.reduce((sum, s) => sum + s.components.filter(isScored).length, 0);
      scoreRaw += Math.round((c.scorePercent / 100) * questions);
      scoreMax += questions;
    }
  }
  const scorePercent = scoreMax > 0 ? Math.round((scoreRaw / scoreMax) * 100) : 100;
  const passed = modules.every((m) => byModule.get(m.id)!.passed);
  const duration = modules.reduce((sum, m) => sum + (byModule.get(m.id)!.durationSeconds ?? 0), 0);

  const firstCompletion = enrollment.status !== "completed";
  const changed = firstCompletion || enrollment.passed !== passed || enrollment.scorePercent !== scorePercent;
  if (!changed) return { completed: true, scoreRaw, scoreMax, scorePercent, passed };

  await prisma.$transaction([
    prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        status: "completed",
        completedAt: now,
        scoreRaw,
        scoreMax,
        scorePercent,
        passed,
        durationSeconds: duration,
        activeTimeSeconds: duration,
        ...(passed && !enrollment.firstPassedAt ? { firstPassedAt: now } : {}),
      },
    }),
    prisma.enrollmentAttempt.create({
      data: {
        enrollmentId,
        startedAt: new Date(now.getTime() - duration * 1000),
        completedAt: now,
        durationSeconds: duration,
        activeTimeSeconds: duration,
        scoreRaw,
        scoreMax,
        scorePercent,
        passed,
        longestCorrectStreak: 0,
      },
    }),
  ]);

  // Бали й сповіщення — best-effort ПІСЛЯ запису: збій не відкочує результат.
  try {
    await syncEnrollmentEvents(enrollmentId);
  } catch (err) {
    console.warn("[rating] course completion:", (err as Error)?.message);
  }
  // Керівнику — лише подія (перше завершення або «нарешті склав»), а не кожне
  // покращення балу: інакше кожне перескладання було б новим сповіщенням.
  if (firstCompletion || (passed && !enrollment.passed)) {
    try {
      await notifySubordinateCourseResult(employee.manager?.id ?? null, {
        enrollmentId,
        employeeId: employee.id,
        employeeName: employee.name,
        courseTitle,
        passed,
        completedAt: now,
      });
    } catch (err) {
      console.warn("[notifications] subordinate course result:", (err as Error)?.message);
    }
  }
  return { completed: true, scoreRaw, scoreMax, scorePercent, passed };
}
