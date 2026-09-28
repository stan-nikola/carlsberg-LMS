import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
// exceljs, не "xlsx" (SheetJS 0.18.5 з npm): у тієї версії відомі CVE на
// розбір підготовленого файла (CVE-2023-30533 prototype pollution,
// CVE-2024-22363 ReDoS), а виправлені версії в npm так і не вийшли.
// exceljs і так уже є для експорту. CLI-скрипти prisma/import-*.js
// лишились на xlsx — вони читають лише власні довірені файли локально.
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/adminAuth";

const COLUMNS = ["externalCode", "name", "email", "positionCode", "territoryName", "managerExternalCode"];

/** Значення клітинки exceljs → текст (гіперпосилання/пошта, rich text, формула). */
function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text ?? "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return String(value.result ?? "");
    return "";
  }
  return String(value);
}
import { prisma } from "@/lib/prisma";

// POST /api/admin/employees/import — Фаза B2. multipart/form-data, поле
// "file" — заповнений шаблон з GET .../import-template. ТІЛЬКИ створює
// нових співробітників (за externalCode) — рядок з кодом, що вже є в
// базі, пропускається (не оновлюється), щоб випадкова помилка у файлі не
// затерла реальні managerId/посаду в уже імпортованих 1910+ записах (те
// саме рішення, що prisma/import-employees.js, тепер доступне через
// веб-UI, не лише CLI-скрипт).
//
// managerExternalCode — посилання на КОД уже існуючого в базі
// співробітника (не вгадується по імені/території). Якщо код не
// знайдено — рядок все одно створюється, але БЕЗ managerId (не
// вигадувати зв'язок), із поясненням у звіті "пропущено/попереджень".
export async function POST(request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const rows = [];
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const sheet = wb.getWorksheet("Нові співробітники") || wb.worksheets[0];
    if (!sheet) throw new Error("у файлі немає аркушів");
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // рядок заголовків
      const record = { rowNumber };
      COLUMNS.forEach((key, i) => {
        record[key] = cellText(row.getCell(i + 1).value).trim();
      });
      rows.push(record);
    });
  } catch {
    return NextResponse.json({ error: "Не вдалося прочитати файл: потрібен .xlsx за шаблоном" }, { status: 400 });
  }

  const dataRows = rows.filter((r) => r.externalCode || r.name);

  if (dataRows.length === 0) {
    return NextResponse.json({ createdCount: 0, skippedRows: [] });
  }

  const [positions, territories, existingByCode] = await Promise.all([
    prisma.position.findMany({ select: { id: true, code: true } }),
    prisma.territory.findMany({ select: { id: true, name: true } }),
    prisma.employee.findMany({ select: { id: true, externalCode: true } }),
  ]);
  const positionByCode = new Map(positions.map((p) => [p.code.toUpperCase(), p.id]));
  const territoryByName = new Map(territories.map((t) => [t.name.trim().toLowerCase(), t.id]));
  const employeeIdByCode = new Map(existingByCode.map((e) => [e.externalCode.toUpperCase(), e.id]));

  const skippedRows = [];
  let createdCount = 0;

  // Послідовно (не Promise.all) — рядків у файлі реалістично десятки-сотні
  // за раз (ручний одноразовий імпорт, не 1900+), послідовність простіша
  // й безпечніша за паралельні insert з можливими гонками на externalCode.
  for (const row of dataRows) {
    const externalCode = String(row.externalCode || "").trim();
    const name = String(row.name || "").trim();

    if (!externalCode || !name) {
      skippedRows.push({ row: row.rowNumber, reason: "немає externalCode або name" });
      continue;
    }
    if (employeeIdByCode.has(externalCode.toUpperCase())) {
      skippedRows.push({ row: row.rowNumber, reason: `externalCode «${externalCode}» вже існує — рядок пропущено` });
      continue;
    }

    const positionCode = String(row.positionCode || "").trim();
    const positionId = positionCode ? positionByCode.get(positionCode.toUpperCase()) : undefined;
    if (positionCode && !positionId) {
      skippedRows.push({ row: row.rowNumber, reason: `positionCode «${positionCode}» не знайдено — створено без посади` });
    }

    const territoryName = String(row.territoryName || "").trim();
    const territoryId = territoryName ? territoryByName.get(territoryName.toLowerCase()) : undefined;
    if (territoryName && !territoryId) {
      skippedRows.push({ row: row.rowNumber, reason: `territoryName «${territoryName}» не знайдено — створено без території` });
    }

    const managerExternalCode = String(row.managerExternalCode || "").trim();
    const managerId = managerExternalCode ? employeeIdByCode.get(managerExternalCode.toUpperCase()) : undefined;
    if (managerExternalCode && !managerId) {
      skippedRows.push({
        row: row.rowNumber,
        reason: `managerExternalCode «${managerExternalCode}» не знайдено — створено без керівника`,
      });
    }

    const email = String(row.email || "").trim() || null;

    try {
      const created = await prisma.employee.create({
        data: {
          externalCode,
          name,
          email,
          positionId: positionId || null,
          territoryId: territoryId || null,
          managerId: managerId || null,
        },
        select: { id: true, externalCode: true },
      });
      employeeIdByCode.set(created.externalCode.toUpperCase(), created.id);
      createdCount += 1;
    } catch (err) {
      skippedRows.push({ row: row.rowNumber, reason: "помилка запису: " + err.message });
    }
  }

  await audit("employee.import", "employee", null, { createdCount, skipped: skippedRows.length });
  return NextResponse.json({ createdCount, skippedRows });
}
