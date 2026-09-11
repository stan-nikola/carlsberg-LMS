import { NextResponse } from "next/server";
import XLSX from "xlsx";
import { requireAdmin } from "@/lib/adminAuth";
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
  let rows;
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const sheet = wb.Sheets["Нові співробітники"] || wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, {
      header: ["externalCode", "name", "email", "positionCode", "territoryName", "managerExternalCode"],
      range: 1, // пропустити рядок заголовків
      defval: "",
    });
  } catch (err) {
    return NextResponse.json({ error: "Не вдалося прочитати файл: " + err.message }, { status: 400 });
  }

  const dataRows = rows
    .map((r, i) => ({ ...r, rowNumber: i + 2 })) // +2: рядок 1 — заголовок, XLSX 1-indexed
    .filter((r) => String(r.externalCode || "").trim() || String(r.name || "").trim());

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

  return NextResponse.json({ createdCount, skippedRows });
}
