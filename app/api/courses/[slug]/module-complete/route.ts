import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
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
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await finishModuleAttempt(employee, slug, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
