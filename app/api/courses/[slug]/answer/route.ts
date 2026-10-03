import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { answerQuestion } from "@/lib/moduleAttempts";

/**
 * POST /api/courses/:slug/answer
 * Body: { enrollmentId, moduleId, componentId, response }
 *
 * Перевірка однієї відповіді на сервері (2026-09-27, аудит S-C1). Відповідь
 * записується в поточну спробу модуля й більше не змінюється; у відповідь —
 * правильно/ні і розбір (правильні варіанти, пояснення). Ключів відповідей
 * у браузері до цього моменту немає (lib/grading.ts publicContent).
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const employee = await getCurrentUser();
  if (!employee) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await answerQuestion(employee.id, slug, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
