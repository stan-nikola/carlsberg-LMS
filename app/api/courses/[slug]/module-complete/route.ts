import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/session";
import { finishModuleAttempt } from "@/lib/moduleAttempts";

/**
 * POST /api/courses/:slug/module-complete
 * Body: { enrollmentId, moduleId, clientAttemptId, answers?: { [componentId]: response }, durationSeconds? }
 *
 * Закриває поточну спробу модуля. Бал рахується ЛИШЕ на сервері з уже
 * перевірених відповідей (POST …/answer) плюс тих, що дані без мережі й
 * приїхали в `answers` (перевіряються тут). Бал/«складено» від клієнта не
 * приймаються взагалі — до 2026-09-27 саме так курс «складали» з devtools.
 * Модуль, який зараз не можна проходити (порядок, пауза, гальмо
 * перескладання), — 409. Повтор того самого clientAttemptId повертає вже
 * записаний результат. Коли результат є в кожного модуля, курс закривається
 * тут же (lib/moduleAttempts.ts finalizeEnrollment) — у відповіді `course`.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Перевірка сесії (активність, відкликання) — легкий запит, що йде
  // паралельно з курсом і модулем усередині finishModuleAttempt, а не перед
  // ними (раніше — повний профіль із посадою й керівником, 2 звернення).
  const employee = prisma.employee.findFirst({
    where: { id: claims.employeeId, isActive: true, sessionVersion: claims.version },
    select: { id: true, name: true, managerId: true },
  });
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await finishModuleAttempt(employee, slug, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
