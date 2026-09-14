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
// "Зведення" (перша вкладка) — дзеркало дашборда /manager: підсумкові
// числа команди, складання по курсу, горизонт дедлайнів, розподіл балів,
// складання з першої спроби й найскладніші модулі — усе наочними data-bar
// смугами (сама бібліотека exceljs НЕ вміє записувати
// справжні вбудовані діаграми Excel — це задокументоване обмеження, не
// недогляд; data-bar умовне форматування — найближчий реальний
// візуальний еквівалент, який Excel відображає нативно). "Рекомендації"
// — модулі, які НЕ складено (ModuleCompletion.passed===false — реальний
// прохідний поріг ЦЬОГО курсу на момент складання, Course.passThreshold,
// НЕ захардкоджені 80%, бо поріг тепер редагується per-курс в
// конструкторі), відсортовані від найгірших, плюс теми, де "проседає"
// одразу кілька людей (систематична, не індивідуальна проблема). Решта
// вкладок — повна деталізація по всьому, що реально зберігається в БД
// (відповіді на конкретні питання ніде не пишуться — найдрібніший
// наявний рівень це бал за МОДУЛЬ).
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
    // "80%+" у назві прибрано — поріг тепер per-курс (Course.passThreshold,
    // редагується в конструкторі), не єдина захардкоджена цифра; сам
    // stats.passRate вже й раніше рахувався з реального Enrollment.passed,
    // не з порівняння з 80 тут.
    ["Складено, %", stats.passRate],
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
  // Той самий лічильник, що стовпчик "% складання по курсу" на
  // /manager (lib/managerDashboard.js getDashboardStats.courseBreakdown)
  // — рахує passed===true, не просто status===completed (провалені курси
  // сюди не потрапляють).
  const courseHeaderRow = summaryWs.addRow(["Курс", "% складання команди", null, "Складено / всього"]);
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

  // Блоки, що дзеркалять діаграми дашборда (lib/managerDashboard.js
  // bucketDeadlineHorizon / bucketScores / computeFirstAttempt /
  // rankHardestModules). Рахуються там само, що й на екрані — Excel не
  // має бути "іншою правдою" з власною арифметикою; сюди приходять уже
  // готові масиви з тими самими підписами.
  let barPriority = 3;
  const addCountBlock = (title, valueHeader, rows, barColor) => {
    if (rows.length === 0) return;
    summaryWs.addRow([]);
    const headerRow = summaryWs.addRow([title, valueHeader]);
    styleHeaderRow(headerRow);
    const firstDataRow = headerRow.number + 1;
    rows.forEach((r) => summaryWs.addRow([r.label, r.count]));
    const lastDataRow = firstDataRow + rows.length - 1;
    addBorders(summaryWs, firstDataRow, lastDataRow, 2);
    // Максимум смуги — найбільша корзина, а не 100: тут абсолютні
    // кількості, а не відсотки, і шкала 0-100 зробила б усі смуги
    // однаково куцими на невеликій команді.
    summaryWs.addConditionalFormatting({
      ref: `B${firstDataRow}:B${lastDataRow}`,
      rules: [
        {
          type: "dataBar",
          cfvo: [
            { type: "num", value: 0 },
            { type: "num", value: Math.max(1, ...rows.map((r) => r.count)) },
          ],
          color: { argb: barColor },
          priority: barPriority++,
        },
      ],
    });
  };

  // Синій (нейтральний), а не червоний: у горизонті дедлайнів довга смуга
  // сама по собі не погана — "понад 30 днів" це нормальний запас.
  addCountBlock("Дедлайни на горизонті", "Незавершених призначень", stats.deadlineHorizon, "FF4B87C5");
  addCountBlock("Розподіл балів", "Завершених курсів", stats.scoreDistribution, "FF17B169");
  addCountBlock("Час на проходження", "Спроб", stats.durations.buckets, "FF4B87C5");
  if (stats.durations.medianSeconds != null) {
    // Медіана окремим рядком під розподілом — те саме, що підпис під
    // діаграмою на дашборді. Середнє свідомо не пишемо: одна забута
    // вкладка на кілька годин робить його неінформативним.
    summaryWs.addRow([
      "Медіана часу, хв",
      Math.round(stats.durations.medianSeconds / 60),
      stats.durations.medianActiveSeconds != null
        ? `у фокусі ${Math.round(stats.durations.medianActiveSeconds / 60)} хв`
        : "",
    ]);
  }

  if (stats.firstAttempt.total > 0) {
    summaryWs.addRow([]);
    const firstTryHeaderRow = summaryWs.addRow(["З першої спроби", "Значення"]);
    styleHeaderRow(firstTryHeaderRow);
    const firstTryFirstRow = firstTryHeaderRow.number + 1;
    summaryWs.addRow(["Складено з першої спроби, %", stats.firstAttempt.pct]);
    summaryWs.addRow(["Склали одразу", stats.firstAttempt.passedFirst]);
    summaryWs.addRow(["З другої спроби та далі", stats.firstAttempt.retried]);
    addBorders(summaryWs, firstTryFirstRow, firstTryFirstRow + 2, 2);
  }

  // Найскладніші модулі — те саме, що однойменний блок на дашборді.
  // Перетинається з "Системними темами" на вкладці "Рекомендації", але не
  // дублює її: там — лише теми, де провалилось 2+ людини, і без
  // знаменника; тут — повний рейтинг із "скільки з скількох".
  if (stats.hardestModules.length > 0) {
    summaryWs.addRow([]);
    const hardHeaderRow = summaryWs.addRow(["Найскладніший модуль", "% провалу", "Курс", "Провалило / проходило"]);
    styleHeaderRow(hardHeaderRow);
    const hardFirstDataRow = hardHeaderRow.number + 1;
    stats.hardestModules.forEach((m) => {
      summaryWs.addRow([m.title, m.pct, m.course || "", `${m.failed}/${m.total}`]);
    });
    const hardLastDataRow = hardFirstDataRow + stats.hardestModules.length - 1;
    addBorders(summaryWs, hardFirstDataRow, hardLastDataRow, 4);
    // Червоний — тут довга смуга однозначно погана (на відміну від
    // горизонту дедлайнів вище).
    summaryWs.addConditionalFormatting({
      ref: `B${hardFirstDataRow}:B${hardLastDataRow}`,
      rules: [
        {
          type: "dataBar",
          cfvo: [
            { type: "num", value: 0 },
            { type: "num", value: 100 },
          ],
          color: { argb: "FFD64545" },
          priority: barPriority++,
        },
      ],
    });
  }

  // ==================== 2. Рекомендації ====================
  // m.passed — реальний прохідний поріг САМЕ ТОГО курсу на момент
  // складання (Course.passThreshold), не захардкоджені 80% — поріг тепер
  // редагується per-курс у конструкторі, тож єдине порівняльне число тут
  // було б неправильним для курсів з іншим порогом.
  const weakModules = moduleCompletions
    .filter((m) => m.passed === false)
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
