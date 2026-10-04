import crypto from "node:crypto";
import { after } from "next/server";
import type { Prisma, PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { isScored, SCORED_COMPONENT_TYPES } from "@/lib/componentTypes";
import { canStartModuleAttempt } from "@/lib/courseContent";
import { gradeResponse, publicContent, revealFor, seededRandom, type KeyOf } from "@/lib/grading";
import { formatWait, pickQuestionPool, poolSeed, resolveRetryRules, retryGate } from "@/lib/retryPolicy";
import { syncEnrollmentEvents } from "@/lib/rating";
import { invalidateEmployeeEnrollments } from "@/lib/employeeProgress";
import { notifySubordinateCourseResult } from "@/lib/notifications";
import { evaluateAutoBadgesForEmployee } from "@/lib/badgeRules";
import { auditEmployee } from "@/lib/audit";

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

/**
 * Непрозорі key елементів питання (варіанти, кроки, пари) — HMAC, щоб за key
 * не вгадати правильний порядок. Свої для кожного призначення курсу: інакше
 * ключі правильних варіантів одного співробітника підходили всім (готова
 * «шпаргалка» для запитів напряму в API).
 */
export function serverKeyOf(componentId: number, enrollmentId: number): KeyOf {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return (kind, index) =>
    crypto.createHmac("sha256", secret).update(`grade:${enrollmentId}:${componentId}:${kind}:${index}`).digest("base64url").slice(0, 12);
}

/** Відповідь на одне питання — і онлайн, і офлайн (разом із завершенням модуля) — не більше 4000 символів JSON. */
const MAX_RESPONSE_CHARS = 4000;
function acceptableResponse(value: unknown): boolean {
  return value != null && typeof value === "object" && JSON.stringify(value).length <= MAX_RESPONSE_CHARS;
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
    content: publicContent(component.type, component.content as Record<string, unknown>, serverKeyOf(component.id, enrollmentId), contentSeed(enrollmentId, component.id)),
  };
}

/** Номер спроби, яку людина проходить ЗАРАЗ (відкрита або наступна) — з уже прочитаних спроб і результатів. */
export function attemptNumbersFrom(
  open: { moduleId: number; attemptNumber: number }[],
  completions: { moduleId: number; attemptCount: number }[]
): Map<number, number> {
  const out = new Map<number, number>();
  for (const c of completions) out.set(c.moduleId, c.attemptCount + 1);
  for (const o of open) out.set(o.moduleId, o.attemptNumber);
  return out;
}

/**
 * Уже дані відповіді відкритих спроб — плеєр показує їх після перезавантаження
 * замість порожніх питань. Вміст питань — з уже завантаженого курсу
 * (componentById), а не повторним запитом до бази.
 */
export function openAttemptAnswersFrom(
  rows: { componentId: number; correct: boolean; response: unknown }[],
  componentById: Map<number, { type: string; content: unknown }>,
  enrollmentId: number
) {
  return Object.fromEntries(
    rows.flatMap((r) => {
      const c = componentById.get(r.componentId);
      if (!c) return [];
      const reveal = revealFor(c.type, c.content as Record<string, unknown>, serverKeyOf(r.componentId, enrollmentId), r.correct, r.response);
      return [[r.componentId, { correct: r.correct, response: r.response, reveal }]];
    })
  );
}

// ------------------------------------------------------------- завантаження

/** Метадані модуля — порядок і паузи; для перевірки доступу вміст інших модулів не потрібен. */
const MODULE_META = {
  id: true,
  title: true,
  order: true,
  courseId: true,
  cooldownDays: true,
  retakeCooldownDays: true,
  retryFreeAttempts: true,
  retryCooldownHours: true,
  questionPoolSize: true,
} as const;

const MODULE_SCREENS = {
  orderBy: [{ order: "asc" }, { id: "asc" }],
  select: { components: { orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, type: true, content: true } } },
} satisfies Prisma.ScreenFindManyArgs;

/**
 * Курс, призначення, вміст модуля й сесія — паралельно, а не по черзі: кожен
 * послідовний запит до бази — це затримка, яку людина відчуває між тапом по
 * відповіді й вердиктом. Вміст (екрани/компоненти) — лише цього модуля.
 * employeeId може бути промісом (сесія вантажиться разом із рештою); null — немає сесії.
 */
async function loadContext(employeeIdInput: number | Promise<number | null>, slug: string, enrollmentId: number, moduleId: number) {
  const mid = Number(moduleId);
  const [employeeId, course, enrollment, moduleContent] = await Promise.all([
    employeeIdInput,
    prisma.course.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        passThreshold: true,
        modulePauseDays: true,
        retryFreeAttempts: true,
        retryCooldownHours: true,
        modules: { orderBy: { order: "asc" }, select: MODULE_META },
      },
    }),
    Number.isInteger(enrollmentId) ? prisma.enrollment.findUnique({ where: { id: enrollmentId } }) : null,
    Number.isInteger(mid) ? prisma.module.findUnique({ where: { id: mid }, select: { courseId: true, screens: MODULE_SCREENS } }) : null,
  ]);
  if (employeeId == null) return { ok: false as const, status: 401, message: "Unauthorized" };
  if (!course) return { ok: false as const, status: 404, message: "Course not found" };
  if (!enrollment || enrollment.employeeId !== employeeId || enrollment.courseId !== course.id) {
    return { ok: false as const, status: 404, message: "Enrollment not found" };
  }
  const meta = course.modules.find((m) => m.id === mid);
  if (!meta || !moduleContent || moduleContent.courseId !== course.id) return { ok: false as const, status: 404, message: "Module not found" };
  return { ok: true as const, course, enrollment, courseModule: { ...meta, screens: moduleContent.screens } };
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

type AnswerBody = { enrollmentId?: unknown; moduleId?: unknown; componentId?: unknown; response?: unknown };

/**
 * Оцінювані питання модуля ОДНИМ запитом, у порядку плеєра (екран, потім
 * компонент) — Prisma з вкладеним select ходить у базу тричі по черзі
 * (модуль → екрани → компоненти). Порожньо — модуля нема в цьому курсі.
 * Список типів — одним рядковим параметром, а не Prisma.join: у dev клієнт
 * бази живе в globalThis між HMR і фрагмент з нового екземпляра модуля не
 * впізнає (запит мовчки не знаходив жодного питання).
 */
async function loadModuleQuestions(slug: string, moduleId: number) {
  const rows = await prisma.$queryRaw<{ questionPoolSize: number | null; id: number | null; type: string | null; content: unknown }[]>`
    SELECT m."questionPoolSize", c.id, c.type::text AS type, c.content
    FROM "Module" m
    JOIN "Course" co ON co.id = m."courseId" AND co.slug = ${slug}
    LEFT JOIN "Screen" s ON s."moduleId" = m.id
    LEFT JOIN "Component" c ON c."screenId" = s.id AND c.type::text = ANY(string_to_array(${SCORED_COMPONENT_TYPES.join(",")}, ','))
    WHERE m.id = ${moduleId}::int
    ORDER BY s."order", s.id, c."order", c.id`;
  if (rows.length === 0) return null;
  const components = rows.filter((r) => r.id != null) as ComponentLike[];
  // modulePool бере лише плаский порядок компонентів — один «екран» еквівалентний.
  return { id: moduleId, questionPoolSize: rows[0].questionPoolSize, screens: [{ components }] };
}

/**
 * Відповідь на питання. Звичайний випадок — спроба модуля вже відкрита:
 * призначення (разом із перевіркою сесії), питання модуля й відкрита спроба
 * читаються паралельно, далі коротка транзакція «замок → вставка». Разом —
 * 5 послідовних звернень до бази замість 8 (2026-10-03). Перша відповідь
 * спроби (спробу ще треба відкрити з перевіркою порядку/пауз) іде повним
 * шляхом answerOpeningAttempt.
 */
export async function answerQuestion(
  claims: { employeeId: number; version: number } | null,
  slug: string,
  body: AnswerBody
): Promise<AnswerResult> {
  if (!claims) return { ok: false, status: 401, error: "Unauthorized" };
  const enrollmentId = Number(body.enrollmentId);
  const moduleId = Number(body.moduleId);
  const componentId = Number(body.componentId);
  if (![enrollmentId, moduleId, componentId].every(Number.isInteger)) {
    // Порожній запит прогріву з плеєра (CoursePlayer.jsx): будимо з'єднання з базою, нічого не пишемо.
    await prisma.$queryRaw`SELECT 1`;
    return { ok: false, status: 404, error: "Question not found" };
  }
  if (body.response == null || typeof body.response !== "object") return { ok: false, status: 400, error: "response is required" };
  if (!acceptableResponse(body.response)) return { ok: false, status: 400, error: "response too large" };

  const [enrollment, courseModule, open] = await Promise.all([
    prisma.enrollment.findFirst({
      where: { id: enrollmentId, course: { slug }, employee: { id: claims.employeeId, isActive: true, sessionVersion: claims.version } },
      select: { id: true, status: true },
    }),
    loadModuleQuestions(slug, moduleId),
    prisma.moduleAttempt.findFirst({ where: { enrollmentId, moduleId, finishedAt: null }, orderBy: { id: "desc" } }),
  ]);
  if (!enrollment) {
    // 401 для відкликаної сесії — плеєр тоді кладе відповідь у чергу, як і раніше.
    const alive = await prisma.employee.count({ where: { id: claims.employeeId, isActive: true, sessionVersion: claims.version } });
    return alive ? { ok: false, status: 404, error: "Enrollment not found" } : { ok: false, status: 401, error: "Unauthorized" };
  }
  if (!courseModule) return { ok: false, status: 404, error: "Module not found" };
  const component = courseModule.screens[0].components.find((c) => c.id === componentId);
  if (!component) return { ok: false, status: 404, error: "Question not found" };
  if (!open) return answerOpeningAttempt(claims.employeeId, slug, body);
  if (!modulePool(courseModule, enrollmentId, open.attemptNumber).has(componentId)) {
    return { ok: false, status: 409, error: "Це питання не входить у поточну спробу — оновіть сторінку." };
  }

  const keyOf = serverKeyOf(componentId, enrollmentId);
  const content = component.content as Record<string, unknown>;
  const correct = gradeResponse(component.type, content, body.response, keyOf);
  const outcome = await prisma.$transaction(async (tx) => {
    await lockModule(tx, enrollmentId, moduleId);
    // Після замка — свіжий знімок: у спробу, яку щойно закрило завершення
    // модуля (воно тримає той самий замок), відповідь уже не потрапить.
    const inserted = await tx.$executeRaw`
      INSERT INTO "AttemptAnswer" ("attemptId", "componentId", "response", "correct")
      SELECT ${open.id}::int, ${componentId}::int, ${JSON.stringify(body.response)}::jsonb, ${correct}
      WHERE EXISTS (SELECT 1 FROM "ModuleAttempt" WHERE id = ${open.id}::int AND "finishedAt" IS NULL)
      ON CONFLICT ("attemptId", "componentId") DO NOTHING`;
    if (inserted === 1) {
      if (enrollment.status === "not_started") {
        await tx.enrollment.update({ where: { id: enrollmentId }, data: { status: "in_progress" } });
        auditEmployee(claims.employeeId, "learning.course_start", { type: "enrollment", id: enrollmentId });
      }
      return { correct, response: body.response, alreadyAnswered: false };
    }
    const existing = await tx.attemptAnswer.findUnique({ where: { attemptId_componentId: { attemptId: open.id, componentId } } });
    return existing ? { correct: existing.correct, response: existing.response, alreadyAnswered: true } : null;
  });
  // Спробу закрили між читанням і вставкою — далі як із першою відповіддю нової спроби.
  if (!outcome) return answerOpeningAttempt(claims.employeeId, slug, body);
  return {
    ok: true,
    correct: outcome.correct,
    response: outcome.response,
    alreadyAnswered: outcome.alreadyAnswered,
    reveal: revealFor(component.type, content, keyOf, outcome.correct, outcome.response),
  };
}

/** Повний шлях: спроба модуля ще не відкрита — відкриваємо її з перевіркою порядку, пауз і гальма. */
async function answerOpeningAttempt(employeeId: number, slug: string, body: AnswerBody): Promise<AnswerResult> {
  const ctx = await loadContext(employeeId, slug, Number(body.enrollmentId), Number(body.moduleId));
  if (!ctx.ok) return { ok: false, status: ctx.status, error: ctx.message };
  const componentId = Number(body.componentId);
  const component = ctx.courseModule.screens.flatMap((s) => s.components).find((c) => c.id === componentId);
  if (!component || !isScored(component)) return { ok: false, status: 404, error: "Question not found" };
  if (body.response == null || typeof body.response !== "object") return { ok: false, status: 400, error: "response is required" };
  if (!acceptableResponse(body.response)) return { ok: false, status: 400, error: "response too large" };

  const keyOf = serverKeyOf(component.id, ctx.enrollment.id);
  const content = component.content as Record<string, unknown>;
  const outcome = await prisma.$transaction(async (tx) => {
    await lockModule(tx, ctx.enrollment.id, ctx.courseModule.id);
    const opened = await openAttempt(tx, ctx);
    if ("blocked" in opened) return { blocked: opened.blocked };
    const attempt = opened.attempt;
    if (!modulePool(ctx.courseModule, ctx.enrollment.id, attempt.attemptNumber).has(component.id)) return { notInPool: true };
    // Звичайний випадок — нова відповідь: одразу вставка (skipDuplicates), без
    // окремого попереднього читання; лише якщо вона вже була — читаємо її.
    const correct = gradeResponse(component.type, content, body.response, keyOf);
    const inserted = await tx.attemptAnswer.createMany({
      data: [{ attemptId: attempt.id, componentId, response: body.response as Prisma.InputJsonValue, correct }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) {
      const existing = await tx.attemptAnswer.findUnique({ where: { attemptId_componentId: { attemptId: attempt.id, componentId } } });
      return { correct: existing!.correct, response: existing!.response, alreadyAnswered: true };
    }
    if (ctx.enrollment.status === "not_started") {
      await tx.enrollment.update({ where: { id: ctx.enrollment.id }, data: { status: "in_progress" } });
      auditEmployee(employeeId, "learning.course_start", { type: "enrollment", id: ctx.enrollment.id });
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
    reveal: revealFor(component.type, content, keyOf, outcome.correct, outcome.response),
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

type FinishEmployee = { id: number; name: string; managerId: number | null };

/**
 * `employeeInput` — проміс (module-complete передає перевірку сесії, щоб вона
 * йшла паралельно з курсом/модулем, а не перед ними); null — сесії нема.
 */
export async function finishModuleAttempt(
  employeeInput: Promise<FinishEmployee | null>,
  slug: string,
  body: { enrollmentId?: unknown; moduleId?: unknown; clientAttemptId?: unknown; answers?: unknown; durationSeconds?: unknown }
): Promise<FinishResult> {
  const clientAttemptId = typeof body.clientAttemptId === "string" && CLIENT_ATTEMPT_ID.test(body.clientAttemptId) ? body.clientAttemptId : null;
  // Старий формат (бал від клієнта, без clientAttemptId) — відкидаємо: саме
  // він дозволяв «скласти» курс запитом із devtools. Офлайн-черга 4xx викидає.
  if (!clientAttemptId) return { ok: false, status: 400, error: "clientAttemptId is required" };

  const ctx = await loadContext(
    employeeInput.then((e) => e?.id ?? null),
    slug,
    Number(body.enrollmentId),
    Number(body.moduleId)
  );
  if (!ctx.ok) return { ok: false, status: ctx.status, error: ctx.message };
  const employee = (await employeeInput)!;
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
      const completion = await tx.moduleCompletion.findUnique({
        where: { enrollmentId_moduleId: { enrollmentId: enrollment.id, moduleId: courseModule.id } },
      });
      return { attempt: replay, answers: replay.answers, replayed: true, completion };
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
      .filter((c) => pool.has(c.id) && !answered.has(c.id) && acceptableResponse(payloadAnswers[String(c.id)]))
      .map((c) => ({
        attemptId: attempt.id,
        componentId: c.id,
        response: payloadAnswers[String(c.id)] as Prisma.InputJsonValue,
        correct: gradeResponse(c.type, c.content as Record<string, unknown>, payloadAnswers[String(c.id)], serverKeyOf(c.id, enrollment.id)),
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
    let completion;
    if (!old) {
      completion = await tx.moduleCompletion.create({
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
      completion = await tx.moduleCompletion.update({
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
    return { attempt: finished, answers, replayed: false, completion };
  });

  if ("conflict" in outcome) return { ok: false, status: 409, error: "clientAttemptId belongs to another module" };
  if ("blocked" in outcome) return { ok: false, status: 409, error: REASON_TEXT[outcome.blocked!] ?? "Модуль зараз недоступний" };

  const { attempt, completion } = outcome;
  if (!outcome.replayed) {
    auditEmployee(employee.id, "learning.module_complete", { type: "enrollment", id: enrollment.id }, {
      module: courseModule.title,
      course: course.title,
      scorePercent: attempt.scorePercent,
      passed: attempt.passed === true,
      attempt: attempt.attemptNumber,
    });
  }
  const courseState = outcome.replayed
    ? await readCourseState(enrollment.id)
    : await finalizeEnrollment(enrollment.id, employee, course.title, new Date(), course.modules.map((m) => m.id));
  invalidateEmployeeEnrollments();

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
 *
 * Звичайний випадок — курс ще не пройдено до кінця: призначення, результати
 * модулів і (якщо не передані) id модулів читаються одним паралельним кроком
 * і функція одразу виходить. Раніше вона щоразу тягнула весь курс до рівня
 * компонентів (5 звернень по черзі) — лише щоб повернути null.
 */
export async function finalizeEnrollment(
  enrollmentId: number,
  employee: { id: number; name: string; managerId?: number | null },
  courseTitle: string,
  now = new Date(),
  knownModuleIds?: number[]
): Promise<CourseState | null> {
  const [enrollment, completions, moduleIds] = await Promise.all([
    prisma.enrollment.findUnique({ where: { id: enrollmentId } }),
    prisma.moduleCompletion.findMany({ where: { enrollmentId } }),
    knownModuleIds ??
      prisma.module
        .findMany({ where: { course: { enrollments: { some: { id: enrollmentId } } } }, select: { id: true } })
        .then((ms) => ms.map((m) => m.id)),
  ]);
  if (!enrollment) return null;
  const byModule = new Map(completions.map((c) => [c.moduleId, c]));
  if (moduleIds.length === 0 || !moduleIds.every((id) => byModule.has(id))) return null;

  // Рядки, записані до появи scoreRaw/scoreMax — відновлюємо з відсотка й
  // реальної кількості оцінюваних питань модуля (як і раніше робила сторінка).
  // Питання читаються лише для таких модулів.
  const legacyIds = moduleIds.filter((id) => byModule.get(id)!.scoreRaw == null || byModule.get(id)!.scoreMax == null);
  const questionsByModule = new Map<number, number>();
  if (legacyIds.length) {
    const components = await prisma.component.findMany({
      where: { screen: { moduleId: { in: legacyIds } } },
      select: { type: true, screen: { select: { moduleId: true } } },
    });
    for (const c of components.filter(isScored)) questionsByModule.set(c.screen.moduleId, (questionsByModule.get(c.screen.moduleId) ?? 0) + 1);
  }

  let scoreRaw = 0;
  let scoreMax = 0;
  for (const id of moduleIds) {
    const c = byModule.get(id)!;
    if (c.scoreRaw != null && c.scoreMax != null) {
      scoreRaw += c.scoreRaw;
      scoreMax += c.scoreMax;
    } else {
      const questions = questionsByModule.get(id) ?? 0;
      scoreRaw += Math.round((c.scorePercent / 100) * questions);
      scoreMax += questions;
    }
  }
  const modules = moduleIds.map((id) => ({ id }));
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
  // after() — уже після відповіді людині (2026-10-03): сповіщення керівнику
  // це ще й Web Push і Telegram по HTTP, і людина на останньому модулі чекала
  // їх до вердикту. Бали з'являються на мить пізніше — кеш рейтингу й так 60 с.
  const notifyManager = firstCompletion || (passed && !enrollment.passed);
  auditEmployee(employee.id, "learning.course_complete", { type: "enrollment", id: enrollmentId }, { course: courseTitle, scorePercent, passed, first: firstCompletion });
  after(async () => {
    try {
      await syncEnrollmentEvents(enrollmentId);
    } catch (err) {
      console.warn("[rating] course completion:", (err as Error)?.message);
    }
    // Авто-відзнаки («Курс складено», «5 курсів пройдено», «Без помилок») —
    // одразу, а не з наступним щоденним cron.
    try {
      await evaluateAutoBadgesForEmployee(employee.id);
    } catch (err) {
      console.warn("[badges] course completion:", (err as Error)?.message);
    }
    // Керівнику — лише подія (перше завершення або «нарешті склав»), а не кожне
    // покращення балу: інакше кожне перескладання було б новим сповіщенням.
    if (!notifyManager) return;
    try {
      await notifySubordinateCourseResult(employee.managerId ?? null, {
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
  });
  return { completed: true, scoreRaw, scoreMax, scorePercent, passed };
}
