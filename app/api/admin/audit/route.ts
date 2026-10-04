import { NextResponse } from "next/server";
import type { PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { isSuperAdmin } from "@/lib/adminSession";
import { audit, AUDIT_RETENTION_MAX_DAYS, AUDIT_RETENTION_MIN_DAYS, getAuditRetentionDays, setAuditRetentionDays } from "@/lib/audit";
import { auditWhere, enrichAuditRows, parseAuditFilters } from "@/lib/auditQuery";

const prisma = prismaUntyped as PrismaClient;
const PAGE = 100;

/**
 * GET /api/admin/audit?actor=&category=&q=&employeeId=&cursor= — журнал дій
 * платформи (2026-10-04): адмінка, входи, навчання, дії керівників, профіль,
 * активність, cron. Сторінки по 100 (курсор — id). Ті самі фільтри —
 * у /api/admin/audit/export (Excel).
 */
export async function GET(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const where = await auditWhere(parseAuditFilters(sp));
  const cursor = Number(sp.get("cursor"));
  if (Number.isInteger(cursor) && cursor > 0) (where.AND as object[]).push({ id: { lt: cursor } });

  const [rows, retentionDays, superAdmin] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { id: "desc" }, take: PAGE + 1 }),
    getAuditRetentionDays(),
    isSuperAdmin(),
  ]);
  const page = rows.slice(0, PAGE);
  return NextResponse.json({
    entries: await enrichAuditRows(page),
    nextCursor: rows.length > PAGE ? page[page.length - 1].id : null,
    retentionDays,
    canEditRetention: superAdmin,
  });
}

/** PUT /api/admin/audit — { retentionDays } термін зберігання записів співробітників і системи. Лише супер-адмін. */
export async function PUT(request: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const days = Number(body?.retentionDays);
  if (!Number.isInteger(days) || days < AUDIT_RETENTION_MIN_DAYS || days > AUDIT_RETENTION_MAX_DAYS) {
    return NextResponse.json({ error: `Від ${AUDIT_RETENTION_MIN_DAYS} до ${AUDIT_RETENTION_MAX_DAYS} днів` }, { status: 400 });
  }
  const before = await getAuditRetentionDays();
  await setAuditRetentionDays(days);
  await audit("audit.retention", "audit", null, { from: before, to: days });
  return NextResponse.json({ retentionDays: days });
}
