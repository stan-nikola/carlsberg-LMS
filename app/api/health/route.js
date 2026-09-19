import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isPushConfigured } from "@/lib/webPush";
import { isDemoLoginEnabled } from "@/lib/demoLogin";
import { isTelegramConfigured } from "@/lib/telegram";

/**
 * GET /api/health — перевірка після деплою (DEPLOY.md): чи жива база, чи
 * застосовано міграції (остання з _prisma_migrations), чи задано push і
 * демо-вхід. Без секретів у відповіді. Публічний: нічого не розкриває,
 * крім факту «працює».
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const rows = await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`;
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
    return NextResponse.json({ ok: false, db: false, error: err?.message || "db_error" }, { status: 503 });
  }
}
