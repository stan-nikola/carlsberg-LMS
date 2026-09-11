import ExcelJS from "exceljs";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier, getAllSubordinates } from "@/lib/permissions";
import { getExportData, getDashboardStats } from "@/lib/managerDashboard";
import { PLATFORM_NAME } from "@/lib/branding";
import {
  BRAND_GREEN,
  FAIL_FILL,
  statusLabel,
  fmtDate,
  fmtMinutes,
  medalEmoji,
  styleHeaderRow,
  addBorders,
  autoSheet,
  highlightPassColumn,
} from "@/lib/excelReport";

// GET /api/manager/export — повний Excel-звіт по видимій команді керівника.
// "Зведення" (перша вкладка) — підсумкові числа команди + наочні data-bar
// смуги виконання по курсу (сама бібліотека exceljs НЕ вміє записувати
// справжні вбудовані діаграми Excel — це задокументоване обмеження, не
// недогляд; data-bar умовне форматування — найближчий реальний
// візуальний еквівалент, який Excel відображає нативно). "Рекомендації"
// — модулі з балом нижче прохідних 80%, відсортовані від найгірших,
// плюс теми, де "проседає" одразу кілька людей (систематична, не
// індивідуальна проблема). Решта вкладок — повна деталізація по всьому,
// що реально зберігається в БД (відповіді на конкретні питання ніде не
// пишуться — найдрібніший наявний рівень це бал за МОДУЛЬ).
export async function GET() {
  const employee = await getCurrentUser();
  if (!employee) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  if (!isManagerTier(employee)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  const subordinateIds = await getAllSubordinates(employee.id);
  const [{ employees, enrollments, attempts, moduleCompletions }, stats] = await Promise.all([
    getExportData(subordinateIds),
    getDashboardStats(subordinateIds),
  ]);

  const enrollmentById = new Map(enrollments.map((e) => [e.id, e]));

  const wb = new ExcelJS.Workbook();
  wb.creator = PLATFORM_NAME;
  wb.created = new Date();

  // ==================== 1. Зведення ====================
  const summaryWs = wb.addWorksheet("Зведення");
  summaryWs.columns = [{ width: 26 }, { width: 16 }, { width: 40 }, { width: 12 }, { width: 12 }];

  summaryWs.mergeCells("A1:E1");
  summaryWs.getCell("A1").value = `Звіт по команді — ${employee.name} (${fmtDate(new Date())})`;
  summaryWs.getCell("A1").font = { bold: true, size: 14, color: { argb: BRAND_GREEN } };
  summaryWs.addRow([]);

  const kpiRows = [
    ["У команді", stats.teamSize],
    ["Виконано, %", stats.completionRate],
    ["Складено (80%+), %", stats.passRate],
    ["Вчасно, %", stats.onTimeRate],
    ["Розпочали, %", stats.engagementRate],
    ["Середній бал, %", stats.avgScore ?? ""],
    ["Прострочено", stats.overdueCount],
  ];
  const kpiHeaderRow = summaryWs.addRow(["Показник", "Значення"]);
  styleHeaderRow(kpiHeaderRow);
  const kpiFirstDataRow = kpiHeaderRow.number + 1;
  kpiRows.forEach(([label, value]) => summaryWs.addRow([label, value]));
  const kpiLastDataRow = kpiFirstDataRow + kpiRows.length - 1;
  summaryWs.getColumn(2).numFmt = "0";
  addBorders(summaryWs, kpiFirstDataRow, kpiLastDataRow, 2);

  summaryWs.addRow([]);
  const courseHeaderRow = summaryWs.addRow(["Курс", "% виконання команди", null, "Завершено / всього"]);
  styleHeaderRow(courseHeaderRow);
  const courseFirstDataRow = courseHeaderRow.number + 1;
  stats.courseBreakdown.forEach((c) => {
    summaryWs.addRow([c.title, c.pct, null, `${c.completed}/${c.total}`]);
  });
  const courseLastDataRow = courseFirstDataRow + stats.courseBreakdown.length - 1;
  if (stats.courseBreakdown.length > 0) addBorders(summaryWs, courseFirstDataRow, courseLastDataRow, 4);

  // Data-bar замість справжньої діаграми (обмеження бібліотеки — див.
  // коментар вище функції GET) — Excel малює зелену смугу пропорційно
  // значенню прямо в клітинці, наочно і без жодних зовнішніх об'єктів.
  if (stats.courseBreakdown.length > 0) {
    summaryWs.addConditionalFormatting({
      ref: `B${courseFirstDataRow}:B${courseLastDataRow}`,
      rules: [
        {
          type: "dataBar",
          cfvo: [
            { type: "num", value: 0 },
            { type: "num", value: 100 },
          ],
          color: { argb: "FF17B169" },
          priority: 1,
        },
      ],
    });
  }
  if (kpiRows.length > 0) {
    // Тільки для рядків-відсотків (2-5) — "У команді" й "Прострочено" не
    // відсотки, їх у цю смугу включати не можна.
    summaryWs.addConditionalFormatting({
      ref: `B${kpiFirstDataRow + 1}:B${kpiFirstDataRow + 4}`,
      rules: [
        {
          type: "dataBar",
          cfvo: [
            { type: "num", value: 0 },
            { type: "num", value: 100 },
          ],
          color: { argb: "FF4B87C5" },
          priority: 2,
        },
      ],
    });
  }

  // ==================== 2. Рекомендації ====================
  const weakModules = moduleCompletions
    .filter((m) => m.scorePercent < 80)
    .map((m) => {
      const e = enrollmentById.get(m.enrollmentId);
      return {
        name: e?.employee.name || "",
        code: e?.employee.externalCode || "",
        course: e?.course.title || "",
        module: m.module.title,
        score: m.scorePercent,
      };
    })
    .sort((a, b) => a.score - b.score);

  const recRows = weakModules.map((w) => ({
    "Ім'я": w.name,
    Код: w.code,
    Курс: w.course,
    Модуль: w.module,
    "Бал, %": w.score,
    Рекомендація:
      w.score < 50
        ? "Критично — особиста розмова й повторне проходження модуля"
        : "Варто повторити модуль і переконатись у розумінні теми",
  }));
  const recWs = autoSheet(
    wb,
    "Рекомендації",
    [
      { header: "Ім'я", key: "Ім'я", width: 26 },
      { header: "Код", key: "Код", width: 12 },
      { header: "Курс", key: "Курс", width: 38 },
      { header: "Модуль", key: "Модуль", width: 38 },
      { header: "Бал, %", key: "Бал, %", width: 10 },
      { header: "Рекомендація", key: "Рекомендація", width: 46 },
    ],
    recRows
  );
  recWs.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const score = row.getCell(5).value;
    if (typeof score === "number" && score < 50) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIL_FILL } };
      });
    }
  });

  // Систематичні теми — де провалюється НЕ ОДНА людина (не індивідуальна
  // прогалина, а привід переглянути сам модуль/подачу матеріалу).
  const byModuleTitle = new Map();
  for (const w of weakModules) {
    const entry = byModuleTitle.get(w.module) || { module: w.module, people: new Set(), scores: [] };
    entry.people.add(w.name);
    entry.scores.push(w.score);
    byModuleTitle.set(w.module, entry);
  }
  const systemicTopics = Array.from(byModuleTitle.values())
    .filter((e) => e.people.size >= 2)
    .map((e) => ({
      Тема: e.module,
      "Людей провалило": e.people.size,
      "Середній бал, %": Math.round(e.scores.reduce((s, x) => s + x, 0) / e.scores.length),
    }))
    .sort((a, b) => b["Людей провалило"] - a["Людей провалило"]);

  if (systemicTopics.length > 0) {
    recWs.addRow([]);
    const sysHeaderRow = recWs.addRow(["Системні теми (провалило 2+ людини)"]);
    sysHeaderRow.font = { bold: true, color: { argb: BRAND_GREEN } };
    const sysTableHeaderRow = recWs.addRow(["Тема", "", "", "Людей провалило", "Середній бал, %"]);
    styleHeaderRow(sysTableHeaderRow);
    const sysFirstDataRow = sysTableHeaderRow.number + 1;
    systemicTopics.forEach((t) => {
      recWs.addRow([t["Тема"], "", "", t["Людей провалило"], t["Середній бал, %"]]);
    });
    addBorders(recWs, sysFirstDataRow, sysFirstDataRow + systemicTopics.length - 1, 5);
  }

  // ==================== 3-6. Деталізація ====================
  autoSheet(
    wb,
    "Команда",
    [
      { header: "Ім'я", key: "a", width: 26 },
      { header: "Код", key: "b", width: 12 },
      { header: "Посада", key: "c", width: 26 },
      { header: "Територія", key: "d", width: 22 },
      { header: "Курсів призначено", key: "e", width: 16 },
      { header: "Завершено", key: "f", width: 12 },
      { header: "Складено", key: "g", width: 12 },
      { header: "Прострочено", key: "h", width: 12 },
      { header: "Середній бал", key: "i", width: 12 },
    ],
    employees.map((emp) => {
      const own = enrollments.filter((e) => e.employeeId === emp.id);
      const completed = own.filter((e) => e.status === "completed");
      const scored = completed.filter((e) => e.scorePercent != null);
      const avgScore = scored.length ? Math.round(scored.reduce((s, e) => s + e.scorePercent, 0) / scored.length) : "";
      return {
        a: emp.name,
        b: emp.externalCode,
        c: emp.position?.name || "",
        d: emp.territory?.name || "",
        e: own.length,
        f: completed.length,
        g: completed.filter((e) => e.passed).length,
        h: own.filter((e) => e.status === "overdue").length,
        i: avgScore,
      };
    })
  );

  const assignmentsWs = autoSheet(
    wb,
    "Призначення",
    [
      { header: "Ім'я", key: "a", width: 26 },
      { header: "Код", key: "b", width: 12 },
      { header: "Курс", key: "c", width: 38 },
      { header: "Статус", key: "d", width: 20 },
      { header: "Бал, %", key: "e", width: 10 },
      { header: "Складено", key: "f", width: 10 },
      { header: "Призначено", key: "g", width: 13 },
      { header: "Дедлайн", key: "h", width: 13 },
      { header: "Завершено", key: "i", width: 13 },
      { header: "Тривалість, хв", key: "j", width: 14 },
      { header: "Серія поспіль", key: "k", width: 13 },
      { header: "Медаль", key: "l", width: 9 },
    ],
    enrollments.map((e) => ({
      a: e.employee.name,
      b: e.employee.externalCode,
      c: e.course.title,
      d: statusLabel(e.status, e.passed),
      e: e.scorePercent ?? "",
      f: e.passed == null ? "" : e.passed ? "Так" : "Ні",
      g: fmtDate(e.assignedAt),
      h: fmtDate(e.dueDate),
      i: fmtDate(e.completedAt),
      j: fmtMinutes(e.durationSeconds),
      k: e.longestCorrectStreak || "",
      l: medalEmoji(e.scorePercent),
    }))
  );
  highlightPassColumn(assignmentsWs, "f");

  const attemptsWs = autoSheet(
    wb,
    "Спроби",
    [
      { header: "Ім'я", key: "a", width: 26 },
      { header: "Код", key: "b", width: 12 },
      { header: "Курс", key: "c", width: 38 },
      { header: "Дата спроби", key: "d", width: 13 },
      { header: "Бал, %", key: "e", width: 10 },
      { header: "Складено", key: "f", width: 10 },
      { header: "Тривалість, хв", key: "g", width: 14 },
      { header: "Найдовша серія правильних", key: "h", width: 22 },
      { header: "Медаль", key: "i", width: 9 },
    ],
    attempts.map((a) => {
      const enrollment = enrollmentById.get(a.enrollmentId);
      return {
        a: enrollment?.employee.name || "",
        b: enrollment?.employee.externalCode || "",
        c: enrollment?.course.title || "",
        d: fmtDate(a.completedAt),
        e: a.scorePercent,
        f: a.passed ? "Так" : "Ні",
        g: fmtMinutes(a.durationSeconds),
        h: a.longestCorrectStreak,
        i: medalEmoji(a.scorePercent),
      };
    })
  );
  highlightPassColumn(attemptsWs, "f");

  const modulesWs = autoSheet(
    wb,
    "Модулі",
    [
      { header: "Ім'я", key: "a", width: 26 },
      { header: "Код", key: "b", width: 12 },
      { header: "Курс", key: "c", width: 38 },
      { header: "Модуль", key: "d", width: 38 },
      { header: "Бал, %", key: "e", width: 10 },
      { header: "Складено", key: "f", width: 10 },
      { header: "Дата", key: "g", width: 13 },
      { header: "Серія поспіль", key: "h", width: 13 },
      { header: "Медаль", key: "i", width: 9 },
    ],
    moduleCompletions.map((m) => {
      const enrollment = enrollmentById.get(m.enrollmentId);
      return {
        a: enrollment?.employee.name || "",
        b: enrollment?.employee.externalCode || "",
        c: enrollment?.course.title || "",
        d: m.module.title,
        e: m.scorePercent,
        f: m.passed ? "Так" : "Ні",
        g: fmtDate(m.completedAt),
        h: m.longestCorrectStreak ?? "",
        i: medalEmoji(m.scorePercent),
      };
    })
  );
  highlightPassColumn(modulesWs, "f");

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `zvit-komandy-${fmtDate(new Date())}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
