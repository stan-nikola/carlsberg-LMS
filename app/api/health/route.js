import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isPushConfigured } from "@/lib/webPush";
import { isDemoLoginEnabled } from "@/lib/demoLogin";
import { isTelegramConfigured } from "@/lib/telegram";
import { isAdminAuthenticated } from "@/lib/adminSession";

/**
 * GET /api/health — перевірка після деплою (DEPLOY.md): чи жива база.
 * Анонімно — лише {ok, db}. Деталі (остання міграція, які канали й демо-вхід
 * увімкнені) — тільки з валідною admin-сесією: публічно вони підказували
 * атакуючому, що саме ввімкнено на проді, а текст помилки БД розкривав
 * внутрішню адресу/конфігурацію (аудит 2026-09-27).
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const rows = await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;
    if (!(await isAdminAuthenticated())) return NextResponse.json({ ok: true, db: true });
    return NextResponse.json({
      ok: true,
      db: true,
      lastMigration: rows[0]?.migration_name ?? null,
      push: isPushConfigured(),
      telegram: isTelegramConfigured(),
      demoLogin: isDemoLoginEnabled(),
      env: process.env.VERCEL_ENV || process.env.NODE_ENV,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("[health] db check failed:", err?.message);
    return NextResponse.json({ ok: false, db: false }, { status: 503 });
  }
}
