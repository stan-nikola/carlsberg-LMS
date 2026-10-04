import ExcelJS from "exceljs";
import type { PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { requireAdmin } from "@/lib/adminAuth";
import { audit } from "@/lib/audit";
import { auditWhere, enrichAuditRows, parseAuditFilters } from "@/lib/auditQuery";
import { AUDIT_ACTION_LABELS, AUDIT_ROLE_LABELS, describeAuditEntry } from "@/lib/auditFormat";
import { autoSheet } from "@/lib/excelReport";

const prisma = prismaUntyped as PrismaClient;

/** Стеля одного файлу: більше — звужуйте фільтри (Excel і пам'ять функції). */
const MAX_ROWS = 20000;

/**
 * GET /api/admin/audit/export?actor=&category=&q=&employeeId= — журнал дій у
 * Excel з тими самими фільтрами, що на екрані /admin/audit (lib/auditQuery.ts),
 * той самий «розбір» (lib/auditFormat.ts). Саме вивантаження теж пишеться в журнал.
 */
export async function GET(request: Request) {
  if (!(await requireAdmin())) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  const filters = parseAuditFilters(new URL(request.url).searchParams);
  const rows = await prisma.auditLog.findMany({ where: await auditWhere(filters), orderBy: { id: "desc" }, take: MAX_ROWS });
  const entries = await enrichAuditRows(rows);

  const wb = new ExcelJS.Workbook();
  const ws = autoSheet(
    wb,
    "Журнал дій",
    [
      { header: "Дата", key: "date", width: 12 },
      { header: "Час", key: "time", width: 10 },
      { header: "Роль", key: "role", width: 14 },
      { header: "Хто", key: "who", width: 26 },
      { header: "Посада", key: "position", width: 26 },
      { header: "Код", key: "code", width: 12 },
      { header: "Дія", key: "action", width: 28 },
      { header: "Об'єкт", key: "target", width: 34 },
      { header: "Розбір", key: "describe", width: 70 },
    ],
    entries.map((e) => {
      const at = new Date(e.createdAt);
      return {
        date: at.toLocaleDateString("uk-UA", { timeZone: "Europe/Kyiv" }),
        time: at.toLocaleTimeString("uk-UA", { timeZone: "Europe/Kyiv" }),
        role: AUDIT_ROLE_LABELS[e.actor] || e.actor,
        who: e.person?.name ?? "",
        position: e.person?.position ?? "",
        code: e.person?.externalCode ?? "",
        action: AUDIT_ACTION_LABELS[e.action] || e.action,
        target: e.target?.label ?? (e.targetId != null ? `#${e.targetId}` : ""),
        describe: describeAuditEntry(e),
      };
    })
  );
  ws.getColumn("describe").alignment = { wrapText: true, vertical: "top" };
  ws.getColumn("target").alignment = { wrapText: true, vertical: "top" };

  await audit("audit.export", "audit", null, { rows: entries.length, filters });
  const buffer = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(new Blob([buffer as BlobPart]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="zhurnal-dii-${stamp}.xlsx"`,
    },
  });
}
