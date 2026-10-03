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
  const startedAt = performance.now();
  // Сесія вантажиться паралельно з курсом/модулем (lib/moduleAttempts.ts
  // loadContext), а не перед ними — менше послідовних запитів до бази.
  const employeeId = getCurrentUser().then((e) => e?.id ?? null);
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await answerQuestion(employeeId, slug, body);
  // Server-Timing — видно в DevTools → Network, скільки займає перевірка на сервері.
  const headers = { "Server-Timing": `answer;dur=${Math.round(performance.now() - startedAt)}` };
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers });
  return NextResponse.json(result, { headers });
}
