import ExcelJS from "exceljs";

import { BRAND_GREEN, FAIL_FILL, GREEN_TINT, HEADER_FILL, fmtDate, fmtMinutes, medalEmoji, statusLabel } from "@/lib/excelReport";
import { CHART_COLORS, barsSvg, columnsSvg, donutSvg, ringsSvg, stackedBarSvg } from "@/lib/reportCharts";
import { attentionTop, buildMatrix, courseFunnels, statusBar, type CellStatus, type PersonCounts, type TeamPerson, type TeamRow } from "@/lib/teamInsights";

/**
 * Excel-звіт керівника (2026-09-24, переосмислення за рішеннями
 * користувача): один лист на кожну УВІМКНЕНУ картку дашборда в її порядку
 * (кнопка «Завантажити звіт» передає набір і порядок), на кожному —
 * таблиця-джерело з тими самими числами, що на екрані, і PNG-діаграма
 * поруч (lib/reportCharts.ts → sharp); далі «Рекомендації» і чотири
 * листи деталізації як РОЗУМНІ таблиці Excel (автофільтр, рядок підсумків,
 * що перераховується під фільтром). Зведення рахує KPI формулами по листу
 * «Призначення» — поправив рядок, зведення оновилось; результат теж
 * записаний, тож цифри видно й без перерахунку.
 *
 * Уся арифметика — та сама, що на дашборді (lib/managerDashboard.js,
 * lib/teamInsights.ts): Excel не має бути «іншою правдою».
 */

// Тонка рамка — той самий вигляд, що CELL_BORDER у lib/excelReport.js, але
// типізована: JS-константа виводиться як {style:string}, і exceljs її не
// приймає в .ts.
const THIN: ExcelJS.Border = { style: "thin", color: { argb: "FFD7E0E2" } };
const BORDER: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };

type Bucket = { key: string; label: string; count: number; alert?: boolean };
export type DashboardStats = {
  teamSize: number;
  completionRate: number;
  passRate: number;
  onTimeRate: number;
  startedRate: number;
  avgScore: number | null;
  overdueCount: number;
  courseBreakdown: { id: number; slug: string; title: string; total: number; completed: number; pct: number }[];
  deadlineHorizon: Bucket[];
  scoreDistribution: Bucket[];
  hardestModules: { id: number; title: string; course: string | null; total: number; failed: number; pct: number; avgAttempts: number }[];
  firstAttempt: { total: number; passedFirst: number; retried: number; pct: number };
  durations: { total: number; medianSeconds: number | null; medianActiveSeconds: number | null; buckets: Bucket[] };
};
export type WeekPoint = { label: string; count: number; people: { name: string; count: number }[] };
export type TreeNode = { id: number; name: string; children: TreeNode[] };
export type HardQuestion = { title: string; module: string; course: string; total: number; correct: number; pct: number };
export type ExportData = {
  employees: { id: number; name: string; externalCode: string | null; position: { name: string } | null; territory: { name: string } | null }[];
  enrollments: {
    id: number;
    employeeId: number;
    status: string;
    passed: boolean | null;
    scorePercent: number | null;
    assignedAt: Date | string | null;
    dueDate: Date | string | null;
    completedAt: Date | string | null;
    durationSeconds: number | null;
    longestCorrectStreak: number | null;
    employee: { name: string; externalCode: string | null };
    course: { title: string };
  }[];
  attempts: { enrollmentId: number; completedAt: Date | string; scorePercent: number | null; passed: boolean | null; durationSeconds: number | null; longestCorrectStreak: number | null }[];
  moduleCompletions: { enrollmentId: number; passed: boolean | null; scorePercent: number | null; completedAt: Date | string; longestCorrectStreak: number | null; module: { title: string } }[];
};

export type ReportInput = {
  managerName: string;
  generatedAt: Date;
  cardIds: string[];
  stats: DashboardStats;
  weeklyTrend: WeekPoint[];
  people: TeamPerson[];
  rows: TeamRow[];
  teamTree: TreeNode[];
  hardestQuestions: HardQuestion[];
  exportData: ExportData;
  /** SVG → PNG (sharp у маршруті; тест підставляє заглушку). */
  rasterize: (svg: string) => Promise<Uint8Array>;
};

export const CARD_SHEETS: Record<string, { title: string; hint: string }> = {
  status: { title: "Стан команди", hint: "Кожна людина рівно в одному сегменті: прострочено → відстає → не почала → неактивна → за графіком." },
  attention: { title: "Потребують уваги", hint: "Найтерміновіші люди: прострочення важать найбільше, далі відставання, не розпочате й відсутність на платформі." },
  rings: { title: "Показники команди", hint: "Частки ПРИЗНАЧЕНЬ (людина × курс): виконано, складено з тих, що дійшли до кінця, вчасно серед тих, де дедлайн вирішено, розпочато." },
  trend: { title: "Активність по тижнях", hint: "Скільки модулів команда склала кожного тижня (зліва старіші) і хто саме." },
  deadlines: { title: "Дедлайни на горизонті", hint: "Незавершені призначення за строком до дедлайну." },
  scoreDist: { title: "Розподіл балів", hint: "Завершені курси за балом. Рівні відрізки шкали, а не прохідний бал — той тепер свій у кожного курсу." },
  firstTry: { title: "З першої спроби", hint: "Частка призначень, складених із першого разу, серед усіх, де була бодай одна спроба." },
  duration: { title: "Час на проходження", hint: "Спроби за тривалістю. Медіана стійка до однієї забутої вкладки, тому середнє не наводимо." },
  courseBreakdown: { title: "Складання по курсу", hint: "Складено серед призначених + воронка: призначено → розпочали → склали → на 100%." },
  hardestModules: { title: "Найскладніші модулі", hint: "Сортування за кількістю провалів, не за відсотком. «Спроб у середньому» — скільки разів доводилось проходити." },
  peopleStatus: { title: "Люди × курси", hint: "Матриця: ✓ складено, ✗ не складено, ! прострочено, ↓ відстає, … в процесі, · не розпочато, порожньо — не призначено." },
  teamCompare: { title: "Порівняння команд", hint: "Кожен прямий підлеглий з усім своїм піддеревом: складено серед призначених." },
  hardestQuestions: { title: "Найскладніші питання", hint: "Питання з найменшою часткою правильних відповідей по всій команді (мінімум 3 відповіді)." },
};

const SEGMENT_COLORS: Record<string, string> = {
  overdue: CHART_COLORS.fail,
  behind: CHART_COLORS.alert,
  not_started: "#9AA5AB",
  inactive: "#5C6B73",
  on_track: CHART_COLORS.green,
};
const CELL_FILL: Record<CellStatus, string> = {
  passed: "FFC9EFDA",
  failed: FAIL_FILL,
  overdue: FAIL_FILL,
  behind: "FFFFF1CC",
  in_progress: "FFDCE9F7",
  not_started: "FFEFF3F0",
};
const CELL_MARK: Record<CellStatus, string> = { passed: "✓", failed: "✗", overdue: "!", behind: "↓", in_progress: "…", not_started: "·" };

/* ---------------- Спільні шматки оформлення ---------------- */

function titleBlock(ws: ExcelJS.Worksheet, title: string, hint: string) {
  ws.getCell("A1").value = title;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: BRAND_GREEN } };
  ws.getCell("A2").value = hint;
  ws.getCell("A2").font = { size: 10, color: { argb: "FF6B7A82" } };
  ws.getCell("A2").alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells("A2:F2");
  ws.getRow(2).height = 30;
}

/** Таблиця з рядка `startRow`: заголовок у фірмовому стилі, рамки, авто-
 *  ширина колонок під найдовше значення (без нескінченних колонок). */
function table(ws: ExcelJS.Worksheet, startRow: number, headers: string[], rows: ExcelJS.CellValue[][], widths?: number[]) {
  const head = ws.getRow(startRow);
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: BRAND_GREEN } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = BORDER;
  });
  rows.forEach((r, ri) => {
    const row = ws.getRow(startRow + 1 + ri);
    r.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.border = BORDER;
    });
  });
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    const longest = Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length));
    col.width = widths?.[i] ?? Math.min(48, Math.max(10, longest + 2));
  });
  return { first: startRow + 1, last: startRow + rows.length };
}

/** Заливка колонки-відсотка зеленою data-bar (нативно в Excel). */
function dataBar(ws: ExcelJS.Worksheet, ref: string, max: number, color: string, priority: number) {
  ws.addConditionalFormatting({
    ref,
    // color є в форматі xlsx і працює в Excel (той самий прийом у старому
    // звіті), лише типи exceljs про нього не знають.
    rules: [{ type: "dataBar", cfvo: [{ type: "num", value: 0 }, { type: "num", value: max }], color: { argb: color }, priority } as unknown as ExcelJS.ConditionalFormattingRule],
  });
}

async function placeImage(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, input: ReportInput, svg: string, col: number, row: number) {
  const buffer = await input.rasterize(svg);
  const size = /width="(\d+)" height="(\d+)"/.exec(svg);
  // exceljs типізований під старий глобальний Buffer; байти йому підходять будь-які.
  const id = wb.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: "png" });
  ws.addImage(id, { tl: { col, row }, ext: { width: Number(size?.[1] ?? 360), height: Number(size?.[2] ?? 200) } });
}

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

/* ---------------- Листи карток ---------------- */

type CardBuilder = (wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, input: ReportInput) => Promise<void>;

const CARD_BUILDERS: Record<string, CardBuilder> = {
  async status(wb, ws, input) {
    const bar = statusBar(input.people, input.rows);
    const rows = bar.segments.map((s) => [s.label, s.count, s.courses ?? ""]);
    rows.push(["Без призначень", bar.noEnrollments, ""]);
    const t = table(ws, 4, ["Стан", "Людей", "Курсів у цьому стані"], rows);
    bar.segments.forEach((s, i) => {
      ws.getCell(t.first + i, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(SEGMENT_COLORS[s.key]) + "" } };
      ws.getCell(t.first + i, 1).font = { color: { argb: s.key === "not_started" || s.key === "on_track" || s.key === "behind" ? "FF212833" : "FFFFFFFF" }, bold: true };
    });
    await placeImage(wb, ws, input, stackedBarSvg(bar.segments.map((s) => ({ count: s.count, color: SEGMENT_COLORS[s.key] })), 480), 4, 3);
  },

  async attention(wb, ws, input) {
    const items = attentionTop(input.people, input.rows, 15);
    const rows = items.map((it) => [it.person.name, it.person.positionName ?? "", it.reasons.map((r) => r.label).join("; "), it.person.lastSeenLabel, it.person.counts.overdue, it.person.counts.notStarted]);
    table(ws, 4, ["Ім'я", "Посада", "Причини", "Останній вхід", "Прострочено", "Не розпочато"], rows, [26, 24, 60, 18, 12, 13]);
  },

  async rings(wb, ws, input) {
    const s = input.stats;
    const rings = [
      { label: "Виконано", pct: s.completionRate, color: CHART_COLORS.green },
      { label: "Складено", pct: s.passRate, color: CHART_COLORS.dark },
      { label: "Вчасно", pct: s.onTimeRate, color: CHART_COLORS.blue },
      { label: "Розпочато", pct: s.startedRate, color: CHART_COLORS.alert },
    ];
    const t = table(ws, 4, ["Показник", "%"], rings.map((r) => [r.label, r.pct]));
    dataBar(ws, `B${t.first}:B${t.last}`, 100, argb(CHART_COLORS.green), 1);
    await placeImage(wb, ws, input, ringsSvg(rings.map((r) => ({ pct: r.pct, color: r.color })), 96), 3, 3);
  },

  async trend(wb, ws, input) {
    const rows = input.weeklyTrend.map((w) => [w.label, w.count, w.people.map((p) => `${p.name} (${p.count})`).join(", ")]);
    table(ws, 4, ["Тиждень", "Складено модулів", "Хто"], rows, [14, 18, 70]);
    await placeImage(wb, ws, input, columnsSvg(input.weeklyTrend.map((w) => w.count), CHART_COLORS.dark, 360, 150), 3, 4 + rows.length + 1);
  },

  async deadlines(wb, ws, input) {
    const b = input.stats.deadlineHorizon;
    const t = table(ws, 4, ["Строк", "Незавершених призначень"], b.map((x) => [x.label, x.count]), [18, 24]);
    dataBar(ws, `B${t.first}:B${t.last}`, Math.max(1, ...b.map((x) => x.count)), argb(CHART_COLORS.blue), 1);
    await placeImage(wb, ws, input, barsSvg(b.map((x) => ({ value: x.count, color: x.alert ? CHART_COLORS.fail : CHART_COLORS.blue }))), 3, 4);
  },

  async scoreDist(wb, ws, input) {
    const b = input.stats.scoreDistribution;
    const t = table(ws, 4, ["Бал", "Завершених курсів"], b.map((x) => [x.label, x.count]), [14, 20]);
    dataBar(ws, `B${t.first}:B${t.last}`, Math.max(1, ...b.map((x) => x.count)), argb(CHART_COLORS.green), 1);
    await placeImage(wb, ws, input, barsSvg(b.map((x) => ({ value: x.count, color: x.key === "lt60" ? CHART_COLORS.fail : CHART_COLORS.green }))), 3, 4);
  },

  async firstTry(wb, ws, input) {
    const f = input.stats.firstAttempt;
    table(
      ws,
      4,
      ["Показник", "Значення"],
      [
        ["Складено з першої спроби, %", f.pct],
        ["Склали одразу", f.passedFirst],
        ["З другої спроби та далі", f.retried],
        ["Призначень зі спробами", f.total],
      ],
      [30, 12]
    );
    await placeImage(wb, ws, input, donutSvg(f.pct, CHART_COLORS.green, 120), 3, 3);
  },

  async duration(wb, ws, input) {
    const d = input.stats.durations;
    const rows: ExcelJS.CellValue[][] = d.buckets.map((x) => [x.label, x.count]);
    const t = table(ws, 4, ["Тривалість", "Спроб"], rows, [16, 12]);
    dataBar(ws, `B${t.first}:B${t.last}`, Math.max(1, ...d.buckets.map((x) => x.count)), argb(CHART_COLORS.blue), 1);
    if (d.medianSeconds != null) {
      ws.getCell(t.last + 2, 1).value = "Медіана, хв";
      ws.getCell(t.last + 2, 2).value = Math.round(d.medianSeconds / 60);
      if (d.medianActiveSeconds != null) {
        ws.getCell(t.last + 3, 1).value = "Медіана у фокусі, хв";
        ws.getCell(t.last + 3, 2).value = Math.round(d.medianActiveSeconds / 60);
      }
    }
    await placeImage(wb, ws, input, barsSvg(d.buckets.map((x) => ({ value: x.count, color: CHART_COLORS.blue }))), 3, 4);
  },

  async courseBreakdown(wb, ws, input) {
    const funnels = new Map(courseFunnels(input.rows).map((f) => [f.id, f]));
    const list = input.stats.courseBreakdown;
    const rows = list.map((c) => {
      const f = funnels.get(c.id);
      return [c.title, c.pct, c.completed, c.total, f?.started ?? "", f?.passed ?? "", f?.perfect ?? ""];
    });
    const t = table(ws, 4, ["Курс", "Складено, %", "Складено", "Призначено", "Розпочали", "Склали", "На 100%"], rows, [40, 12, 11, 12, 11, 10, 10]);
    dataBar(ws, `B${t.first}:B${t.last}`, 100, argb(CHART_COLORS.green), 1);
    await placeImage(wb, ws, input, barsSvg(list.map((c) => ({ value: c.pct, color: CHART_COLORS.green })), 260), 8, 4);
  },

  async hardestModules(wb, ws, input) {
    const m = input.stats.hardestModules;
    const rows = m.map((x) => [x.title, x.course ?? "", x.failed, x.total, x.pct, x.avgAttempts]);
    const t = table(ws, 4, ["Модуль", "Курс", "Провалило", "Проходило", "Провал, %", "Спроб у середньому"], rows, [40, 34, 11, 11, 10, 18]);
    if (m.length) dataBar(ws, `E${t.first}:E${t.last}`, 100, argb(CHART_COLORS.fail), 1);
    await placeImage(wb, ws, input, barsSvg(m.map((x) => ({ value: x.failed, color: CHART_COLORS.fail })), 260), 7, 4);
  },

  async peopleStatus(wb, ws, input) {
    const matrix = buildMatrix(input.people, input.rows, 10_000);
    const headers = ["Людина", ...matrix.courses.map((c) => c.title)];
    const rows = matrix.rows.map((r) => [r.person.name, ...r.cells.map((c) => (c.status ? CELL_MARK[c.status] : ""))]);
    const t = table(ws, 4, headers, rows, [26, ...matrix.courses.map(() => 14)]);
    matrix.rows.forEach((r, ri) =>
      r.cells.forEach((c, ci) => {
        const cell = ws.getCell(t.first + ri, ci + 2);
        cell.alignment = { horizontal: "center" };
        if (c.status) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CELL_FILL[c.status] } };
      })
    );
    ws.getRow(4).alignment = { wrapText: true, vertical: "bottom" };
    ws.getRow(4).height = 60;
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
  },

  async teamCompare(wb, ws, input) {
    const counts = new Map(input.people.map((p) => [p.id, p.counts]));
    const teams = compareTeams(input.teamTree, counts);
    const rows = teams.map((t) => [t.name, t.pct, t.completed, t.total, t.overdue]);
    const t = table(ws, 4, ["Команда", "Складено, %", "Складено", "Призначено", "Прострочено"], rows, [30, 12, 11, 12, 12]);
    if (teams.length) dataBar(ws, `B${t.first}:B${t.last}`, 100, argb(CHART_COLORS.green), 1);
    await placeImage(wb, ws, input, barsSvg(teams.map((x) => ({ value: x.pct, color: CHART_COLORS.green })), 260), 6, 4);
  },

  async hardestQuestions(wb, ws, input) {
    const q = input.hardestQuestions;
    const t = table(ws, 4, ["Питання", "Модуль", "Курс", "Правильно, %", "Правильно", "Відповідей"], q.map((x) => [x.title, x.module, x.course, x.pct, x.correct, x.total]), [50, 30, 30, 12, 11, 11]);
    if (q.length) dataBar(ws, `D${t.first}:D${t.last}`, 100, argb(CHART_COLORS.fail), 1);
  },
};

/** Кожен прямий підлеглий з усім своїм піддеревом — те саме, що картка
 *  «Порівняння команд» на дашборді. Чиста функція, з тестом. */
export function compareTeams(tree: TreeNode[], counts: Map<number, PersonCounts>) {
  const flatten = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap((n) => [n, ...flatten(n.children || [])]);
  return tree
    .map((node) => {
      let total = 0;
      let completed = 0;
      let overdue = 0;
      for (const n of flatten([node])) {
        const c = counts.get(n.id);
        if (!c) continue;
        total += c.total;
        completed += c.completed;
        overdue += c.overdue;
      }
      return { id: node.id, name: node.name, total, completed, overdue, pct: total > 0 ? Math.round((completed / total) * 100) : 0 };
    })
    .filter((t) => t.total > 0)
    .sort((a, b) => b.pct - a.pct);
}

/* ---------------- Деталізація як розумні таблиці ---------------- */

function smartTable(
  ws: ExcelJS.Worksheet,
  name: string,
  columns: { name: string; width: number; totals?: "sum" | "average" | "count" | "countNums" }[],
  rows: ExcelJS.CellValue[][],
  totalsLabel = "Разом"
) {
  ws.addTable({
    name,
    ref: "A1",
    headerRow: true,
    totalsRow: rows.length > 0,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: columns.map((c, i) => ({
      name: c.name,
      filterButton: true,
      totalsRowLabel: i === 0 ? totalsLabel : undefined,
      totalsRowFunction: c.totals ?? (i === 0 ? "none" : "none"),
    })),
    rows,
  });
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function passFill(ws: ExcelJS.Worksheet, col: number, rowCount: number) {
  for (let r = 2; r <= rowCount + 1; r++) {
    const v = ws.getCell(r, col).value;
    if (v !== "Так" && v !== "Ні") continue;
    ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: v === "Так" ? GREEN_TINT : FAIL_FILL } };
  }
}

/* ---------------- Збирання книги ---------------- */

export async function buildManagerReport(input: ReportInput): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CarLS";
  wb.created = input.generatedAt;
  // Формули зведення посилаються на лист «Призначення» — хай Excel
  // перерахує їх при відкритті (результат усе одно записаний нижче).
  wb.calcProperties.fullCalcOnLoad = true;

  const { stats, exportData } = input;
  const n = exportData.enrollments.length;
  const A = (col: string) => `'Призначення'!${col}2:${col}${Math.max(2, n + 1)}`;

  // ---- 1. Зведення ----
  const summary = wb.addWorksheet("Зведення");
  titleBlock(summary, `Звіт по команді — ${input.managerName} (${fmtDate(input.generatedAt)})`, "Зведення рахується формулами по листу «Призначення»: змінили там рядок — тут оновилось. Нижче — по листу на кожну картку дашборда, у тому порядку, як на екрані.");
  const completedEnrollments = exportData.enrollments.filter((e) => e.status === "completed").length;
  const passedYes = exportData.enrollments.filter((e) => e.passed === true).length;
  const passedNo = exportData.enrollments.filter((e) => e.passed === false).length;
  const scoreCells = exportData.enrollments.filter((e) => typeof e.scorePercent === "number");
  const kpi: [string, ExcelJS.CellValue][] = [
    ["У команді, людей", stats.teamSize],
    ["Призначень", { formula: `COUNTA(${A("C")})`, result: n }],
    ["Виконано, %", { formula: `IFERROR(ROUND((COUNTIF(${A("D")},"Складено")+COUNTIF(${A("D")},"Завершено, не складено"))/COUNTA(${A("C")})*100,0),0)`, result: n ? Math.round((completedEnrollments / n) * 100) : 0 }],
    ["Складено, %", { formula: `IFERROR(ROUND(COUNTIF(${A("F")},"Так")/(COUNTIF(${A("F")},"Так")+COUNTIF(${A("F")},"Ні"))*100,0),0)`, result: passedYes + passedNo ? Math.round((passedYes / (passedYes + passedNo)) * 100) : 0 }],
    ["Вчасно, %", stats.onTimeRate],
    ["Розпочато, %", stats.startedRate],
    ["Середній бал, %", { formula: `IFERROR(ROUND(AVERAGE(${A("E")}),0),"")`, result: scoreCells.length ? Math.round(scoreCells.reduce((s, e) => s + (e.scorePercent as number), 0) / scoreCells.length) : "" }],
    ["Прострочено", { formula: `COUNTIF(${A("D")},"Прострочено")`, result: exportData.enrollments.filter((e) => e.status === "overdue").length }],
  ];
  const kt = table(summary, 4, ["Показник", "Значення"], kpi, [26, 12]);
  dataBar(summary, `B${kt.first + 2}:B${kt.first + 5}`, 100, argb(CHART_COLORS.green), 1);
  summary.getCell(kt.last + 2, 1).value = "Листи звіту";
  summary.getCell(kt.last + 2, 1).font = { bold: true, color: { argb: BRAND_GREEN } };
  const included = input.cardIds.filter((id) => CARD_BUILDERS[id]);
  included.forEach((id, i) => {
    const cell = summary.getCell(kt.last + 3 + i, 1);
    cell.value = { text: CARD_SHEETS[id].title, hyperlink: `#'${CARD_SHEETS[id].title}'!A1` };
    cell.font = { color: { argb: "FF1F5FBF" }, underline: true };
  });

  // ---- 2. По листу на картку, у порядку дашборда ----
  for (const id of included) {
    const ws = wb.addWorksheet(CARD_SHEETS[id].title);
    titleBlock(ws, CARD_SHEETS[id].title, CARD_SHEETS[id].hint);
    await CARD_BUILDERS[id](wb, ws, input);
  }

  // ---- 3. Рекомендації ----
  const enrollmentById = new Map(exportData.enrollments.map((e) => [e.id, e]));
  const weak = exportData.moduleCompletions
    .filter((m) => m.passed === false)
    .map((m) => {
      const e = enrollmentById.get(m.enrollmentId);
      return { name: e?.employee.name ?? "", code: e?.employee.externalCode ?? "", course: e?.course.title ?? "", module: m.module.title, score: m.scorePercent ?? 0 };
    })
    .sort((a, b) => a.score - b.score);
  const rec = wb.addWorksheet("Рекомендації");
  smartTable(
    rec,
    "Recommendations",
    [
      { name: "Ім'я", width: 26 },
      { name: "Код", width: 12 },
      { name: "Курс", width: 38 },
      { name: "Модуль", width: 38 },
      { name: "Бал, %", width: 10, totals: "average" },
      { name: "Рекомендація", width: 48 },
    ],
    weak.map((w) => [w.name, w.code, w.course, w.module, w.score, w.score < 50 ? "Критично — особиста розмова й повторне проходження модуля" : "Варто повторити модуль і переконатись у розумінні теми"])
  );
  weak.forEach((w, i) => {
    if (w.score < 50) rec.getRow(i + 2).eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FAIL_FILL } }));
  });

  // ---- 4. Деталізація ----
  const team = wb.addWorksheet("Команда");
  smartTable(
    team,
    "Team",
    [
      { name: "Ім'я", width: 26 },
      { name: "Код", width: 12 },
      { name: "Посада", width: 26 },
      { name: "Територія", width: 22 },
      { name: "Курсів призначено", width: 17, totals: "sum" },
      { name: "Завершено", width: 12, totals: "sum" },
      { name: "Складено", width: 12, totals: "sum" },
      { name: "Прострочено", width: 13, totals: "sum" },
      { name: "Середній бал", width: 13, totals: "average" },
    ],
    exportData.employees.map((emp) => {
      const own = exportData.enrollments.filter((e) => e.employeeId === emp.id);
      const completed = own.filter((e) => e.status === "completed");
      const scored = completed.filter((e) => typeof e.scorePercent === "number");
      return [
        emp.name,
        emp.externalCode ?? "",
        emp.position?.name ?? "",
        emp.territory?.name ?? "",
        own.length,
        completed.length,
        completed.filter((e) => e.passed).length,
        own.filter((e) => e.status === "overdue").length,
        scored.length ? Math.round(scored.reduce((s, e) => s + (e.scorePercent as number), 0) / scored.length) : "",
      ];
    })
  );

  const assignments = wb.addWorksheet("Призначення");
  smartTable(
    assignments,
    "Assignments",
    [
      { name: "Ім'я", width: 26 },
      { name: "Код", width: 12 },
      { name: "Курс", width: 38, totals: "count" },
      { name: "Статус", width: 22 },
      { name: "Бал, %", width: 10, totals: "average" },
      { name: "Складено", width: 10 },
      { name: "Призначено", width: 13 },
      { name: "Дедлайн", width: 13 },
      { name: "Завершено", width: 13 },
      { name: "Тривалість, хв", width: 14, totals: "average" },
      { name: "Серія поспіль", width: 13 },
      { name: "Медаль", width: 9 },
    ],
    exportData.enrollments.map((e) => [
      e.employee.name,
      e.employee.externalCode ?? "",
      e.course.title,
      statusLabel(e.status, e.passed),
      e.scorePercent ?? "",
      e.passed == null ? "" : e.passed ? "Так" : "Ні",
      fmtDate(e.assignedAt),
      fmtDate(e.dueDate),
      fmtDate(e.completedAt),
      fmtMinutes(e.durationSeconds),
      e.longestCorrectStreak || "",
      medalEmoji(e.scorePercent),
    ])
  );
  passFill(assignments, 6, exportData.enrollments.length);

  const attempts = wb.addWorksheet("Спроби");
  smartTable(
    attempts,
    "Attempts",
    [
      { name: "Ім'я", width: 26 },
      { name: "Код", width: 12 },
      { name: "Курс", width: 38, totals: "count" },
      { name: "Дата спроби", width: 13 },
      { name: "Бал, %", width: 10, totals: "average" },
      { name: "Складено", width: 10 },
      { name: "Тривалість, хв", width: 14, totals: "average" },
      { name: "Найдовша серія", width: 15 },
      { name: "Медаль", width: 9 },
    ],
    exportData.attempts.map((a) => {
      const e = enrollmentById.get(a.enrollmentId);
      return [e?.employee.name ?? "", e?.employee.externalCode ?? "", e?.course.title ?? "", fmtDate(a.completedAt), a.scorePercent ?? "", a.passed ? "Так" : "Ні", fmtMinutes(a.durationSeconds), a.longestCorrectStreak ?? "", medalEmoji(a.scorePercent)];
    })
  );
  passFill(attempts, 6, exportData.attempts.length);

  const modules = wb.addWorksheet("Модулі");
  smartTable(
    modules,
    "Modules",
    [
      { name: "Ім'я", width: 26 },
      { name: "Код", width: 12 },
      { name: "Курс", width: 38, totals: "count" },
      { name: "Модуль", width: 38 },
      { name: "Бал, %", width: 10, totals: "average" },
      { name: "Складено", width: 10 },
      { name: "Дата", width: 13 },
      { name: "Серія поспіль", width: 13 },
      { name: "Медаль", width: 9 },
    ],
    exportData.moduleCompletions.map((m) => {
      const e = enrollmentById.get(m.enrollmentId);
      return [e?.employee.name ?? "", e?.employee.externalCode ?? "", e?.course.title ?? "", m.module.title, m.scorePercent ?? "", m.passed ? "Так" : "Ні", fmtDate(m.completedAt), m.longestCorrectStreak ?? "", medalEmoji(m.scorePercent)];
    })
  );
  passFill(modules, 6, exportData.moduleCompletions.length);

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Які картки експортувати: з query `cards=a,b,c` (порядок дашборда), лише
 *  відомі; порожньо чи сміття → всі в канонічному порядку. */
export function parseCardIds(raw: string | null | undefined, canonical: string[]): string[] {
  const ids = (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => CARD_SHEETS[s]);
  return ids.length > 0 ? Array.from(new Set(ids)) : canonical.filter((id) => CARD_SHEETS[id]);
}
