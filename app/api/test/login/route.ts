import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";
import { createAdminSession } from "@/lib/adminSession";

/**
 * POST /api/test/login — вхід без PIN для браузерних тестів (Playwright) і
 * локальної перевірки. Працює ЛИШЕ в dev: `next build`/Vercel ставлять
 * NODE_ENV=production, і маршрут відповідає 404. У базі нічого не змінює
 * (без firstLoginAt, відзнак і журналу — як демо-вхід).
 *
 * Тіло: `{ code }` — сесія співробітника за externalCode;
 *       `{ admin: "admin" | "super" }` — admin_session потрібного рівня.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { code?: string; admin?: string };

  if (body.admin) {
    const level = body.admin === "super" ? "super" : "admin";
    await createAdminSession(level);
    return Response.json({ ok: true, admin: level });
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) return Response.json({ error: "code_required" }, { status: 400 });
  const employee = await prisma.employee.findFirst({
    where: { externalCode: { equals: code, mode: "insensitive" }, isActive: true },
    select: { id: true, externalCode: true, sessionVersion: true },
  });
  if (!employee) return Response.json({ error: "not_found" }, { status: 404 });

  await createSession(employee.id, employee.sessionVersion);
  return Response.json({ ok: true, employee: { id: employee.id, externalCode: employee.externalCode } });
}
