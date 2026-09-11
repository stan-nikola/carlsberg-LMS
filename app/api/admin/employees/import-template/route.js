import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/adminAuth";
import { prisma } from "@/lib/prisma";
import { autoSheet, styleHeaderRow } from "@/lib/excelReport";
import { PLATFORM_NAME } from "@/lib/branding";

// GET /api/admin/employees/import-template — Фаза B2. Шаблон для масового
// додавання НОВИХ співробітників (POST .../import нижче — тільки
// додавання, ніколи оновлення існуючих, за явним рішенням користувача).
// managerExternalCode — посилання на КОД уже існуючого в базі
// співробітника, не ім'я/територія: той самий принцип "не вгадувати
// зв'язки", що вже діє в prisma/import-employees.js. Друга вкладка —
// довідка (реальні коди посад і назви територій), щоб заповнювач не
// вгадував, що саме писати в positionCode/territoryName.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  const [positions, territories] = await Promise.all([
    prisma.position.findMany({ orderBy: { level: "asc" }, select: { code: true, name: true } }),
    prisma.territory.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = PLATFORM_NAME;
  wb.created = new Date();

  const ws = wb.addWorksheet("Нові співробітники", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "externalCode (обов'язково, унікальний)", key: "externalCode", width: 30 },
    { header: "name (обов'язково)", key: "name", width: 28 },
    { header: "email (опційно)", key: "email", width: 28 },
    { header: "positionCode (опційно, див. вкладку «Довідка»)", key: "positionCode", width: 34 },
    { header: "territoryName (опційно, точна назва з вкладки «Довідка»)", key: "territoryName", width: 40 },
    { header: "managerExternalCode (опційно, код УЖЕ існуючого співробітника)", key: "managerExternalCode", width: 40 },
  ];
  styleHeaderRow(ws.getRow(1));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

  autoSheet(
    wb,
    "Довідка",
    [
      { header: "Код посади", key: "a", width: 16 },
      { header: "Назва посади", key: "b", width: 30 },
    ],
    positions.map((p) => ({ a: p.code, b: p.name }))
  );
  autoSheet(wb, "Територiї", [{ header: "Назва території", key: "a", width: 40 }], territories.map((t) => ({ a: t.name })));

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="shablon-novi-spivrobitnyky.xlsx"`,
    },
  });
}
