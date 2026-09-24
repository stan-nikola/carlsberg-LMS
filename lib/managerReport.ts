import ExcelJS from "exceljs";
import { BRAND_GREEN, FAIL_FILL, GREEN_TINT, HEADER_FILL, fmtDate, fmtMinutes, medalEmoji, statusLabel } from "@/lib/excelReport";
import {
  SEGMENT_META,
  attentionTop,
  buildMatrix,
  courseFunnels,
  statusBar,
  type CellStatus,
  type PersonCounts,
  type PersonSegment,
  type TeamPerson,
  type TeamRow,
} from "@/lib/teamInsights";

/**
 * Excel-звіт керівника — «зведення → команда → людина», тим самим шляхом,
 * що й живий дашборд (рішення користувача 2026-09-24 після першої версії
 * з PNG-діаграмами без підписів — «вообще не читабельно»).
 *
 * Листи:
 *   Зведення     — усі блоки дашборда підряд (у порядку карток керівника,
 *                  ?cards=), кожна цифра підписана, смуги — рідні data-bar
 *                  Excel із числом у тій же клітинці, тренд — «діаграма з
 *                  клітинок»; імена/курси — гіперпосилання на свої листи.
 *   Команда      — рядок на людину з усіма лічильниками, ім'я → лист людини.
 *   Люди × курси — матриця станів із повною сіткою й легендою.
 *   Курси        — воронка по кожному курсу.
 *   <Ім'я>       — лист на КОЖНОГО з видимої команди: курси, модулі, спроби,
 *                  що саме провалено, «← Команда».
 *   Рекомендації, Призначення, Спроби, Модулі — сирі дані розумними
 *                  таблицями Excel (автофільтр, підсумки).
 *
 * Жодних картинок: exceljs не пише справжніх діаграм Excel, а PNG без
 * підписів (у serverless нема шрифтів для растеризації) не читався.
 * Уся арифметика — та сама, що на дашборді (lib/managerDashboard.js,
 * lib/teamInsights.ts): Excel не має бути «іншою правдою».
 *
 * Внутрішні посилання — РІВНО у форматі `'Лист'!A1` (без `#`): exceljs
 * розпізнає внутрішні за регуляркою /^[^!]+![A-Z]+\d+$/, і з `#` попереду
 * писав їх як зовнішні — клік по них нічого не робив (перша версія).
 */

const THIN: ExcelJS.Border = { style: "thin", color: { argb: "FFB9C4C8" } };
const GRID: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const LINK_FONT: Partial<ExcelJS.Font> = { color: { argb: "FF1F5FBF" }, underline: true };
const GREEN = "FF17B169";
const DARK = "FF00321E";
const BLUE = "FF4B87C5";
const RED = "FFD64545";

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
};

/** Блоки зведення за id карток дашборда — назва й пояснення «що це». */
export const CARD_BLOCKS: Record<string, { title: string; hint: string }> = {
  status: { title: "Стан команди", hint: "Кожна людина рівно в одному стані: прострочено → відстає → не почала → неактивна → за графіком. Повний список — лист «Команда»." },
  attention: { title: "Потребують уваги", hint: "Найтерміновіші: прострочення важать найбільше, далі відставання, не розпочате, відсутність на платформі. Ім'я — посилання на лист людини." },
  rings: { title: "Показники команди", hint: "Частки призначень (людина × курс): виконано; складено — з тих, що дійшли до кінця; вчасно — серед тих, де дедлайн уже вирішено; розпочато." },
  trend: { title: "Активність по тижнях", hint: "Скільки модулів команда склала кожного тижня (зліва старіші) і хто саме." },
  deadlines: { title: "Дедлайни на горизонті", hint: "Незавершені призначення за строком до дедлайну." },
  scoreDist: { title: "Розподіл балів", hint: "Завершені курси за балом. Рівні відрізки шкали, а не прохідний бал — той свій у кожного курсу." },
  firstTry: { title: "З першої спроби", hint: "Частка призначень, складених із першого разу, серед усіх, де була бодай одна спроба." },
  duration: { title: "Час на проходження", hint: "Спроби за тривалістю. Медіана стійка до однієї забутої вкладки, тому середнє не наводимо." },
  courseBreakdown: { title: "Складання по курсу", hint: "Складено серед призначених і воронка: призначено → розпочали → склали → на 100%. Курс — посилання на лист «Курси»." },
  hardestModules: { title: "Найскладніші модулі", hint: "За кількістю провалів, не за відсотком. «Спроб» — скільки разів у середньому доводилось проходити." },
  peopleStatus: { title: "Люди × курси", hint: "Матриця станів по кожному курсу — окремий лист «Люди × курси»." },
  teamCompare: { title: "Порівняння команд", hint: "Кожен прямий підлеглий з усім своїм піддеревом: складено серед призначених." },
  hardestQuestions: { title: "Найскладніші питання", hint: "Питання з найменшою часткою правильних відповідей по всій команді (мінімум 3 відповіді)." },
};

const SEGMENT_FILL: Record<PersonSegment, { fill: string; ink: string }> = {
  overdue: { fill: RED, ink: "FFFFFFFF" },
  behind: { fill: "FFF0B429", ink: "FF212833" },
  not_started: { fill: "FFD5DDE0", ink: "FF212833" },
  inactive: { fill: "FF5C6B73", ink: "FFFFFFFF" },
  on_track: { fill: GREEN, ink: "FF212833" },
};
const CELL_META: Record<CellStatus, { label: string; mark: string; fill: string }> = {
  passed: { label: "Складено", mark: "✓", fill: "FFC9EFDA" },
  failed: { label: "Не складено", mark: "✗", fill: FAIL_FILL },
  overdue: { label: "Прострочено", mark: "!", fill: FAIL_FILL },
  behind: { label: "Відстає", mark: "↓", fill: "FFFFF1CC" },
  in_progress: { label: "В процесі", mark: "…", fill: "FFDCE9F7" },
  not_started: { label: "Не розпочато", mark: "·", fill: "FFEFF3F0" },
};

/* ---------------- Дрібні помічники ---------------- */

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

/** Внутрішнє посилання — див. шапку файлу про формат без `#`. */
function link(text: string, sheet: string, cell = "A1"): ExcelJS.CellHyperlinkValue {
  return { text, hyperlink: `'${sheet.replace(/'/g, "''")}'!${cell}`, tooltip: `Перейти: ${sheet}` };
}
function setLink(c: ExcelJS.Cell, text: string, sheet: string, cell = "A1") {
  c.value = link(text, sheet, cell);
  c.font = { ...c.font, ...LINK_FONT };
}

/** Заголовок блоку + сірий рядок-пояснення; повертає рядок, з якого писати таблицю. */
function heading(ws: ExcelJS.Worksheet, row: number, title: string, hint?: string, size = 13): number {
  const t = ws.getCell(row, 1);
  t.value = title;
  t.font = { bold: true, size, color: { argb: BRAND_GREEN } };
  if (!hint) return row + 1;
  const h = ws.getCell(row + 1, 1);
  h.value = hint;
  h.font = { size: 9.5, color: { argb: "FF6B7A82" } };
  h.alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(row + 1, 1, row + 1, 8);
  ws.getRow(row + 1).height = hint.length > 110 ? 30 : 16;
  return row + 2;
}

/** Таблиця з ПОВНОЮ сіткою (кожна клітинка в рамці — «шахматка», як просив
 *  користувач), фірмовою шапкою; повертає межі даних і наступний вільний рядок. */
function table(ws: ExcelJS.Worksheet, startRow: number, headers: string[], rows: ExcelJS.CellValue[][]) {
  headers.forEach((h, i) => {
    const c = ws.getCell(startRow, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: BRAND_GREEN } };
    c.fill = solid(HEADER_FILL);
    c.border = GRID;
    c.alignment = { vertical: "middle", wrapText: true };
  });
  rows.forEach((r, ri) =>
    r.forEach((v, i) => {
      const c = ws.getCell(startRow + 1 + ri, i + 1);
      c.value = v;
      c.border = GRID;
      if (typeof v === "number") c.alignment = { horizontal: "right" };
    })
  );
  const first = startRow + 1;
  const last = startRow + rows.length;
  return { first, last, next: last + 2 };
}

/** Смуга в клітинці (число лишається видимим) — нативне умовне форматування. */
function dataBar(ws: ExcelJS.Worksheet, ref: string, max: number, color: string) {
  ws.addConditionalFormatting({
    ref,
    // color є в форматі xlsx і працює в Excel, лише типи exceljs про нього не знають.
    rules: [{ type: "dataBar", cfvo: [{ type: "num", value: 0 }, { type: "num", value: Math.max(1, max) }], color: { argb: color }, priority: 1 } as unknown as ExcelJS.ConditionalFormattingRule],
  });
}

/** Ім'я листа: без заборонених символів, ≤31 символу, унікальне в книзі. */
export function sheetName(raw: string, taken: Set<string>, suffix = ""): string {
  const clean = raw.replace(/[[\]:*?/\\'"]/g, " ").replace(/\s+/g, " ").trim() || "Аркуш";
  const base = suffix && clean.length + suffix.length + 1 <= 31 ? `${clean} ${suffix}` : clean.slice(0, 31);
  let name = base.slice(0, 31);
  let n = 2;
  while (taken.has(name.toLowerCase())) {
    const tail = ` (${n++})`;
    name = base.slice(0, 31 - tail.length) + tail;
  }
  taken.add(name.toLowerCase());
  return name;
}

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

/** Які блоки зведення й у якому порядку: з query `cards=a,b,c`, лише
 *  відомі; порожньо чи сміття → всі в канонічному порядку. */
export function parseCardIds(raw: string | null | undefined, canonical: string[]): string[] {
  const ids = (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => CARD_BLOCKS[s]);
  return ids.length > 0 ? Array.from(new Set(ids)) : canonical.filter((id) => CARD_BLOCKS[id]);
}

/* ---------------- Контекст збірки ---------------- */

type Ctx = ReportInput & {
  wb: ExcelJS.Workbook;
  /** id людини → назва її листа (для посилань з усіх інших листів). */
  personSheet: Map<number, string>;
  rowsByEmployee: Map<number, TeamRow[]>;
  attemptsByEnrollment: Map<number, ExportData["attempts"]>;
  modulesByEnrollment: Map<number, ExportData["moduleCompletions"]>;
  enrollmentById: Map<number, ExportData["enrollments"][number]>;
};

const TEAM = "Команда";
const MATRIX = "Люди × курси";
const COURSES = "Курси";

/* ---------------- Блоки зведення ---------------- */

type Block = (ws: ExcelJS.Worksheet, row: number, ctx: Ctx) => number;

const BLOCKS: Record<string, Block> = {
  status(ws, row, ctx) {
    const bar = statusBar(ctx.people, ctx.rows);
    const rows: ExcelJS.CellValue[][] = bar.segments.map((s) => [s.label, s.count, s.courses ?? "—"]);
    rows.push(["Без призначень", bar.noEnrollments, "—"]);
    const t = table(ws, row, ["Стан", "Людей", "Курсів у цьому стані"], rows);
    bar.segments.forEach((s, i) => {
      const c = ws.getCell(t.first + i, 1);
      c.fill = solid(SEGMENT_FILL[s.key].fill);
      c.font = { bold: true, color: { argb: SEGMENT_FILL[s.key].ink } };
    });
    dataBar(ws, `B${t.first}:B${t.last}`, Math.max(...rows.map((r) => Number(r[1]))), BLUE);
    setLink(ws.getCell(t.last + 1, 1), "Усі люди зі станом → лист «Команда»", TEAM);
    return t.next + 1;
  },

  attention(ws, row, ctx) {
    const items = attentionTop(ctx.people, ctx.rows, 15);
    if (items.length === 0) {
      ws.getCell(row, 1).value = "Нікого — усі за графіком.";
      return row + 2;
    }
    const t = table(
      ws,
      row,
      ["Ім'я", "Посада", "Що не так", "Останній вхід", "Прострочено", "Не розпочато"],
      items.map((it) => [it.person.name, it.person.positionName ?? "", it.reasons.map((r) => r.label).join("; "), it.person.lastSeenLabel, it.person.counts.overdue, it.person.counts.notStarted])
    );
    items.forEach((it, i) => {
      const sheet = ctx.personSheet.get(it.person.id);
      if (sheet) setLink(ws.getCell(t.first + i, 1), it.person.name, sheet);
      if (it.person.counts.overdue > 0) ws.getCell(t.first + i, 5).fill = solid(FAIL_FILL);
    });
    return t.next;
  },

  rings(ws, row, ctx) {
    const s = ctx.stats;
    const t = table(ws, row, ["Показник", "%", "Що рахується"], [
      ["Виконано", s.completionRate, "дійшли до кінця серед усіх призначень"],
      ["Складено", s.passRate, "набрали прохідний бал серед тих, хто дійшов до кінця"],
      ["Вчасно", s.onTimeRate, "вклались у дедлайн серед тих, де дедлайн уже вирішено"],
      ["Розпочато", s.startedRate, "є хоч якийсь рух серед усіх призначень"],
    ]);
    dataBar(ws, `B${t.first}:B${t.last}`, 100, GREEN);
    return t.next;
  },

  trend(ws, row, ctx) {
    // «Діаграма з клітинок»: STEPS рядків, стовпчик тижня зафарбований знизу
    // пропорційно до максимуму; під ним — число й підпис тижня. Читається
    // й друкується як звичайна колонкова діаграма, без картинок.
    const STEPS = 8;
    const weeks = ctx.weeklyTrend;
    const max = Math.max(1, ...weeks.map((w) => w.count));
    weeks.forEach((w, i) => {
      const col = i + 2;
      const filled = w.count > 0 ? Math.max(1, Math.round((w.count / max) * STEPS)) : 0;
      for (let s = 0; s < STEPS; s++) {
        const c = ws.getCell(row + s, col);
        c.border = GRID;
        if (s >= STEPS - filled) c.fill = solid(DARK);
      }
      const n = ws.getCell(row + STEPS, col);
      n.value = w.count;
      n.font = { bold: true };
      n.alignment = { horizontal: "center" };
      n.border = GRID;
      const l = ws.getCell(row + STEPS + 1, col);
      l.value = w.label;
      l.font = { size: 9, color: { argb: "FF6B7A82" } };
      l.alignment = { horizontal: "center", wrapText: true };
      l.border = GRID;
    });
    ws.getCell(row + STEPS, 1).value = "Складено модулів";
    ws.getCell(row + STEPS + 1, 1).value = "Тиждень";
    for (let s = 0; s < STEPS; s++) ws.getRow(row + s).height = 9;
    let next = row + STEPS + 3;
    const who = weeks.filter((w) => w.people.length > 0);
    if (who.length) {
      const t = table(ws, next, ["Тиждень", "Хто складав модулі (скільки)"], who.map((w) => [w.label, w.people.map((p) => `${p.name} (${p.count})`).join(", ")]));
      who.forEach((_, i) => (ws.getCell(t.first + i, 2).alignment = { wrapText: true }));
      next = t.next;
    }
    return next;
  },

  deadlines(ws, row, ctx) {
    const b = ctx.stats.deadlineHorizon;
    const t = table(ws, row, ["Строк", "Незавершених призначень"], b.map((x) => [x.label, x.count]));
    b.forEach((x, i) => {
      if (x.alert && x.count > 0) ws.getCell(t.first + i, 1).fill = solid(FAIL_FILL);
    });
    dataBar(ws, `B${t.first}:B${t.last}`, Math.max(...b.map((x) => x.count)), BLUE);
    return t.next;
  },

  scoreDist(ws, row, ctx) {
    const b = ctx.stats.scoreDistribution;
    const total = b.reduce((s, x) => s + x.count, 0);
    const t = table(ws, row, ["Бал", "Завершених курсів", "Частка, %"], b.map((x) => [x.label, x.count, total ? Math.round((x.count / total) * 100) : 0]));
    if (b[0]?.count) ws.getCell(t.first, 1).fill = solid(FAIL_FILL);
    dataBar(ws, `B${t.first}:B${t.last}`, Math.max(...b.map((x) => x.count)), GREEN);
    return t.next;
  },

  firstTry(ws, row, ctx) {
    const f = ctx.stats.firstAttempt;
    const t = table(ws, row, ["Показник", "Значення"], [
      ["Складено з першої спроби, %", f.pct],
      ["Склали одразу", f.passedFirst],
      ["З другої спроби та далі", f.retried],
      ["Призначень зі спробами", f.total],
    ]);
    dataBar(ws, `B${t.first}:B${t.first}`, 100, GREEN);
    return t.next;
  },

  duration(ws, row, ctx) {
    const d = ctx.stats.durations;
    const rows: ExcelJS.CellValue[][] = d.buckets.map((x) => [x.label, x.count]);
    if (d.medianSeconds != null) rows.push(["Медіана, хв", Math.round(d.medianSeconds / 60)]);
    if (d.medianActiveSeconds != null) rows.push(["Медіана у фокусі, хв", Math.round(d.medianActiveSeconds / 60)]);
    const t = table(ws, row, ["Тривалість", "Спроб"], rows);
    dataBar(ws, `B${t.first}:B${t.first + d.buckets.length - 1}`, Math.max(...d.buckets.map((x) => x.count)), BLUE);
    return t.next;
  },

  courseBreakdown(ws, row, ctx) {
    const funnels = new Map(courseFunnels(ctx.rows).map((f) => [f.id, f]));
    const list = ctx.stats.courseBreakdown;
    const t = table(
      ws,
      row,
      ["Курс", "Складено, %", "Складено", "Призначено", "Розпочали", "Склали", "На 100%"],
      list.map((c) => {
        const f = funnels.get(c.id);
        return [c.title, c.pct, c.completed, c.total, f?.started ?? "", f?.passed ?? "", f?.perfect ?? ""];
      })
    );
    list.forEach((c, i) => setLink(ws.getCell(t.first + i, 1), c.title, COURSES));
    if (list.length) dataBar(ws, `B${t.first}:B${t.last}`, 100, GREEN);
    return t.next;
  },

  hardestModules(ws, row, ctx) {
    const m = ctx.stats.hardestModules;
    if (m.length === 0) {
      ws.getCell(row, 1).value = "Жоден модуль не провалено.";
      return row + 2;
    }
    const t = table(ws, row, ["Модуль", "Курс", "Провалило", "Проходило", "Провал, %", "Спроб у середньому"], m.map((x) => [x.title, x.course ?? "", x.failed, x.total, x.pct, x.avgAttempts]));
    dataBar(ws, `E${t.first}:E${t.last}`, 100, RED);
    return t.next;
  },

  peopleStatus(ws, row) {
    setLink(ws.getCell(row, 1), "Відкрити матрицю «Люди × курси» →", MATRIX);
    return row + 2;
  },

  teamCompare(ws, row, ctx) {
    const counts = new Map(ctx.people.map((p) => [p.id, p.counts]));
    const teams = compareTeams(ctx.teamTree, counts);
    if (teams.length === 0) return row;
    const t = table(ws, row, ["Команда", "Складено, %", "Складено", "Призначено", "Прострочено"], teams.map((x) => [x.name, x.pct, x.completed, x.total, x.overdue]));
    teams.forEach((x, i) => {
      const sheet = ctx.personSheet.get(x.id);
      if (sheet) setLink(ws.getCell(t.first + i, 1), x.name, sheet);
      if (x.overdue > 0) ws.getCell(t.first + i, 5).fill = solid(FAIL_FILL);
    });
    dataBar(ws, `B${t.first}:B${t.last}`, 100, GREEN);
    return t.next;
  },

  hardestQuestions(ws, row, ctx) {
    const q = ctx.hardestQuestions;
    if (q.length === 0) {
      ws.getCell(row, 1).value = "Ще замало відповідей, щоб виділити складні питання.";
      return row + 2;
    }
    const t = table(ws, row, ["Питання", "Модуль", "Курс", "Правильно, %", "Правильно", "Відповідей"], q.map((x) => [x.title, x.module, x.course, x.pct, x.correct, x.total]));
    dataBar(ws, `D${t.first}:D${t.last}`, 100, RED);
    return t.next;
  },
};

/* ---------------- Листи ---------------- */

function buildSummary(ctx: Ctx) {
  const ws = ctx.wb.addWorksheet("Зведення", { views: [{ showGridLines: false }] });
  [36, 14, 14, 14, 14, 14, 14, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  let row = heading(
    ws,
    1,
    `Звіт по команді — ${ctx.managerName} · ${fmtDate(ctx.generatedAt)}`,
    "Зверху — головні числа (формули по листу «Призначення»: поправили рядок там — оновилось тут). Далі — блоки дашборда в тому ж порядку, що на екрані. Сині підписи — посилання: ім'я веде на лист людини, курс — на лист «Курси».",
    15
  );

  const { exportData: ex, stats } = ctx;
  const n = ex.enrollments.length;
  const A = (col: string) => `'Призначення'!${col}2:${col}${Math.max(2, n + 1)}`;
  const completed = ex.enrollments.filter((e) => e.status === "completed").length;
  const yes = ex.enrollments.filter((e) => e.passed === true).length;
  const no = ex.enrollments.filter((e) => e.passed === false).length;
  const scored = ex.enrollments.filter((e) => typeof e.scorePercent === "number");
  const kpi: ExcelJS.CellValue[][] = [
    ["У команді, людей", stats.teamSize],
    ["Призначень", { formula: `COUNTA(${A("C")})`, result: n }],
    ["Виконано, %", { formula: `IFERROR(ROUND((COUNTIF(${A("D")},"Складено")+COUNTIF(${A("D")},"Завершено, не складено"))/COUNTA(${A("C")})*100,0),0)`, result: n ? Math.round((completed / n) * 100) : 0 }],
    ["Складено, %", { formula: `IFERROR(ROUND(COUNTIF(${A("F")},"Так")/(COUNTIF(${A("F")},"Так")+COUNTIF(${A("F")},"Ні"))*100,0),0)`, result: yes + no ? Math.round((yes / (yes + no)) * 100) : 0 }],
    ["Вчасно, %", stats.onTimeRate],
    ["Розпочато, %", stats.startedRate],
    ["Середній бал, %", { formula: `IFERROR(ROUND(AVERAGE(${A("E")}),0),"")`, result: scored.length ? Math.round(scored.reduce((s, e) => s + (e.scorePercent as number), 0) / scored.length) : "" }],
    ["Прострочено призначень", { formula: `COUNTIF(${A("D")},"Прострочено")`, result: ex.enrollments.filter((e) => e.status === "overdue").length }],
  ];
  row = heading(ws, row, "Головне");
  const kt = table(ws, row, ["Показник", "Значення"], kpi);
  dataBar(ws, `B${kt.first + 2}:B${kt.first + 5}`, 100, GREEN);
  if (stats.overdueCount > 0) ws.getCell(kt.last, 2).fill = solid(FAIL_FILL);
  row = kt.next;

  const nav = [
    [TEAM, "усі люди зі станом і лічильниками"],
    [MATRIX, "матриця людина × курс"],
    [COURSES, "воронка по кожному курсу"],
    ["Рекомендації", "кому який модуль повторити"],
  ];
  row = heading(ws, row, "Листи");
  nav.forEach(([sheet, what], i) => {
    setLink(ws.getCell(row + i, 1), sheet, sheet);
    ws.getCell(row + i, 2).value = what;
    ws.getCell(row + i, 2).font = { color: { argb: "FF6B7A82" } };
  });
  row += nav.length + 1;

  for (const id of ctx.cardIds) {
    const block = BLOCKS[id];
    if (!block) continue;
    row = heading(ws, row, CARD_BLOCKS[id].title, CARD_BLOCKS[id].hint);
    row = block(ws, row, ctx);
  }
}

function buildTeam(ctx: Ctx) {
  const ws = ctx.wb.addWorksheet(TEAM);
  const people = [...ctx.people].sort((a, b) => b.urgency - a.urgency || a.name.localeCompare(b.name, "uk"));
  const headers = ["Ім'я", "Код", "Посада", "Стан", "Курсів", "Складено", "Не складено", "В процесі", "Не розпочато", "Прострочено", "Відстає", "Середній бал, %", "Останній вхід"];
  const rows: ExcelJS.CellValue[][] = people.map((p) => {
    const c = p.counts;
    return [p.name, p.externalCode ?? "", p.positionName ?? "", p.segment ? SEGMENT_META[p.segment].label : "Без призначень", c.total, c.completed - c.failed, c.failed, c.inProgress, c.notStarted, c.overdue, c.behind, c.avgScore ?? "", p.lastSeenLabel];
  });
  const row = heading(ws, 1, "Команда", "Рядок на людину. Ім'я — посилання на її лист. Сортування — найтерміновіші зверху. Фільтруйте шапкою: підсумки внизу перераховуються під фільтр.");
  ws.addTable({
    name: "Team",
    ref: `A${row}`,
    headerRow: true,
    totalsRow: true,
    style: { theme: "TableStyleLight1", showRowStripes: true },
    columns: headers.map((h, i) => ({ name: h, filterButton: true, totalsRowLabel: i === 0 ? "Разом" : undefined, totalsRowFunction: i >= 4 && i <= 10 ? "sum" : i === 11 ? "average" : "none" })),
    rows,
  });
  [26, 11, 24, 16, 8, 10, 11, 10, 12, 12, 9, 14, 18].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (let r = row; r <= row + rows.length + 1; r++) for (let c = 1; c <= headers.length; c++) ws.getCell(r, c).border = GRID;
  ws.getRow(row).font = { bold: true, color: { argb: BRAND_GREEN } };
  people.forEach((p, i) => {
    const r = row + 1 + i;
    const sheet = ctx.personSheet.get(p.id);
    if (sheet) setLink(ws.getCell(r, 1), p.name, sheet);
    if (p.segment) {
      ws.getCell(r, 4).fill = solid(SEGMENT_FILL[p.segment].fill);
      ws.getCell(r, 4).font = { bold: true, color: { argb: SEGMENT_FILL[p.segment].ink } };
    }
    if (p.counts.failed > 0) ws.getCell(r, 7).fill = solid(FAIL_FILL);
    if (p.counts.overdue > 0) ws.getCell(r, 10).fill = solid(FAIL_FILL);
  });
  if (rows.length) dataBar(ws, `L${row + 1}:L${row + rows.length}`, 100, GREEN);
  ws.views = [{ state: "frozen", ySplit: row, xSplit: 1 }];
}

function buildMatrixSheet(ctx: Ctx) {
  const ws = ctx.wb.addWorksheet(MATRIX);
  const matrix = buildMatrix(ctx.people, ctx.rows, 10_000);
  const row = heading(ws, 1, "Люди × курси", "Стан кожного призначення. Ім'я — посилання на лист людини.");
  const t = table(ws, row, ["Людина", ...matrix.courses.map((c) => c.title)], matrix.rows.map((r) => [r.person.name, ...r.cells.map((c) => (c.status ? CELL_META[c.status].mark : ""))]));
  ws.getColumn(1).width = 26;
  matrix.courses.forEach((_, i) => (ws.getColumn(i + 2).width = 16));
  ws.getRow(row).height = 64;
  ws.getRow(row).alignment = { wrapText: true, vertical: "bottom" };
  matrix.rows.forEach((r, ri) => {
    const sheet = ctx.personSheet.get(r.person.id);
    if (sheet) setLink(ws.getCell(t.first + ri, 1), r.person.name, sheet);
    r.cells.forEach((c, ci) => {
      const cell = ws.getCell(t.first + ri, ci + 2);
      cell.alignment = { horizontal: "center" };
      if (c.status) cell.fill = solid(CELL_META[c.status].fill);
    });
  });
  let lr = t.next;
  ws.getCell(lr, 1).value = "Легенда";
  ws.getCell(lr, 1).font = { bold: true };
  (Object.keys(CELL_META) as CellStatus[]).forEach((k, i) => {
    const c = ws.getCell(lr + 1 + i, 1);
    c.value = `${CELL_META[k].mark}  ${CELL_META[k].label}`;
    c.fill = solid(CELL_META[k].fill);
    c.border = GRID;
  });
  lr += Object.keys(CELL_META).length + 1;
  ws.getCell(lr, 1).value = "порожньо — курс не призначено";
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: row }];
}

function buildCourses(ctx: Ctx) {
  const ws = ctx.wb.addWorksheet(COURSES);
  const funnels = courseFunnels(ctx.rows).sort((a, b) => b.assigned - a.assigned || a.title.localeCompare(b.title, "uk"));
  const overdueByCourse = new Map<number, number>();
  const failedByCourse = new Map<number, number>();
  for (const r of ctx.rows) {
    if (r.isOverdue) overdueByCourse.set(r.courseId, (overdueByCourse.get(r.courseId) || 0) + 1);
    if (r.status === "completed" && r.passed === false) failedByCourse.set(r.courseId, (failedByCourse.get(r.courseId) || 0) + 1);
  }
  const row = heading(ws, 1, "Курси", "Воронка по кожному курсу: призначено → розпочали → склали → на 100%. Хто саме де застряг — лист «Люди × курси».");
  const t = table(
    ws,
    row,
    ["Курс", "Призначено", "Розпочали", "Склали", "На 100%", "Не склали", "Прострочено", "Складено, %"],
    funnels.map((f) => [f.title, f.assigned, f.started, f.passed, f.perfect, failedByCourse.get(f.id) || 0, overdueByCourse.get(f.id) || 0, f.assigned ? Math.round((f.passed / f.assigned) * 100) : 0])
  );
  [44, 12, 11, 10, 10, 11, 12, 13].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  funnels.forEach((f, i) => {
    if ((failedByCourse.get(f.id) || 0) > 0) ws.getCell(t.first + i, 6).fill = solid(FAIL_FILL);
    if ((overdueByCourse.get(f.id) || 0) > 0) ws.getCell(t.first + i, 7).fill = solid(FAIL_FILL);
  });
  if (funnels.length) dataBar(ws, `H${t.first}:H${t.last}`, 100, GREEN);
}

function buildPerson(ctx: Ctx, p: TeamPerson) {
  const name = ctx.personSheet.get(p.id)!;
  const ws = ctx.wb.addWorksheet(name, { views: [{ showGridLines: false }] });
  [40, 18, 12, 16, 13, 13, 10].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const c = p.counts;
  const passedCount = c.completed - c.failed;
  const title = ws.getCell("A1");
  title.value = p.name;
  title.font = { bold: true, size: 15, color: { argb: BRAND_GREEN } };
  setLink(ws.getCell("B1"), "← Команда", TEAM);
  ws.getCell("A2").value = [p.positionName, p.externalCode].filter(Boolean).join(" · ");
  ws.getCell("A2").font = { color: { argb: "FF6B7A82" } };
  const state = ws.getCell("A3");
  state.value = p.segment ? `Стан: ${SEGMENT_META[p.segment].label}` : "Призначень немає";
  if (p.segment) {
    state.fill = solid(SEGMENT_FILL[p.segment].fill);
    state.font = { bold: true, color: { argb: SEGMENT_FILL[p.segment].ink } };
  }
  const facts: ExcelJS.CellValue[][] = [
    ["Складено", `${passedCount} з ${c.total}`],
    ["Не складено", c.failed],
    ["В процесі", c.inProgress],
    ["Не розпочато", c.notStarted],
    ["Прострочено", c.overdue],
    ["Відстає від графіка", c.behind],
    ["Середній бал, %", c.avgScore ?? "—"],
    ["Останній вхід", p.lastSeenLabel],
  ];
  const ft = table(ws, 5, ["Показник", "Значення"], facts);
  if (c.failed > 0) ws.getCell(ft.first + 1, 2).fill = solid(FAIL_FILL);
  if (c.overdue > 0) ws.getCell(ft.first + 4, 2).fill = solid(FAIL_FILL);

  const mine = (ctx.rowsByEmployee.get(p.id) || []).slice().sort((a, b) => a.courseTitle.localeCompare(b.courseTitle, "uk"));
  let row = heading(ws, ft.next, "Курси", "Стан, бал, дедлайн і скільки модулів складено по кожному призначеному курсу.");
  if (mine.length === 0) {
    ws.getCell(row, 1).value = "Курсів не призначено.";
    row += 2;
  } else {
    const t = table(
      ws,
      row,
      ["Курс", "Стан", "Бал, %", "Модулів складено", "Дедлайн", "Завершено", "Спроб"],
      mine.map((r) => [r.courseTitle, CELL_META[r.cell].label, r.scorePercent ?? "", `${r.modulesPassed} з ${r.modulesTotal}`, r.dueDateLabel ?? "", r.completedAtLabel ?? "", (ctx.attemptsByEnrollment.get(r.enrollmentId) || []).length])
    );
    mine.forEach((r, i) => (ws.getCell(t.first + i, 2).fill = solid(CELL_META[r.cell].fill)));
    dataBar(ws, `C${t.first}:C${t.last}`, 100, GREEN);
    row = t.next;
  }

  const modules = mine.flatMap((r) => (ctx.modulesByEnrollment.get(r.enrollmentId) || []).map((m) => ({ course: r.courseTitle, m })));
  row = heading(ws, row, "Модулі", "Кожен складений модуль. Провалені — червоним: саме їх варто повторити.");
  if (modules.length === 0) {
    ws.getCell(row, 1).value = "Ще жодного модуля не пройдено.";
    row += 2;
  } else {
    const t = table(ws, row, ["Курс", "Модуль", "Бал, %", "Складено", "Дата"], modules.map(({ course, m }) => [course, m.module.title, m.scorePercent ?? "", m.passed ? "Так" : "Ні", fmtDate(m.completedAt)]));
    modules.forEach(({ m }, i) => {
      if (m.passed === false) for (let col = 1; col <= 5; col++) ws.getCell(t.first + i, col).fill = solid(FAIL_FILL);
    });
    row = t.next;
  }

  const attempts = mine.flatMap((r) => (ctx.attemptsByEnrollment.get(r.enrollmentId) || []).map((a) => ({ course: r.courseTitle, a })));
  row = heading(ws, row, "Спроби", "Кожне проходження курсу до кінця.");
  if (attempts.length === 0) {
    ws.getCell(row, 1).value = "Спроб ще не було.";
  } else {
    const t = table(ws, row, ["Курс", "Дата", "Бал, %", "Складено", "Тривалість, хв", "Медаль"], attempts.map(({ course, a }) => [course, fmtDate(a.completedAt), a.scorePercent ?? "", a.passed ? "Так" : "Ні", fmtMinutes(a.durationSeconds), medalEmoji(a.scorePercent)]));
    attempts.forEach(({ a }, i) => (ws.getCell(t.first + i, 4).fill = solid(a.passed ? GREEN_TINT : FAIL_FILL)));
  }
}

function smartTable(ws: ExcelJS.Worksheet, name: string, columns: { name: string; width: number; totals?: "sum" | "average" | "count" }[], rows: ExcelJS.CellValue[][]) {
  ws.addTable({
    name,
    ref: "A1",
    headerRow: true,
    totalsRow: rows.length > 0,
    style: { theme: "TableStyleLight1", showRowStripes: true },
    columns: columns.map((c, i) => ({ name: c.name, filterButton: true, totalsRowLabel: i === 0 ? "Разом" : undefined, totalsRowFunction: c.totals ?? "none" })),
    rows,
  });
  columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  for (let r = 1; r <= rows.length + (rows.length ? 2 : 1); r++) for (let c = 1; c <= columns.length; c++) ws.getCell(r, c).border = GRID;
  ws.getRow(1).font = { bold: true, color: { argb: BRAND_GREEN } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function passFill(ws: ExcelJS.Worksheet, col: number, rowCount: number) {
  for (let r = 2; r <= rowCount + 1; r++) {
    const v = ws.getCell(r, col).value;
    if (v === "Так" || v === "Ні") ws.getCell(r, col).fill = solid(v === "Так" ? GREEN_TINT : FAIL_FILL);
  }
}

function buildRawSheets(ctx: Ctx) {
  const ex = ctx.exportData;
  const weak = ex.moduleCompletions
    .filter((m) => m.passed === false)
    .map((m) => {
      const e = ctx.enrollmentById.get(m.enrollmentId);
      return { name: e?.employee.name ?? "", code: e?.employee.externalCode ?? "", course: e?.course.title ?? "", module: m.module.title, score: m.scorePercent ?? 0 };
    })
    .sort((a, b) => a.score - b.score);
  const rec = ctx.wb.addWorksheet("Рекомендації");
  smartTable(
    rec,
    "Recommendations",
    [{ name: "Ім'я", width: 26 }, { name: "Код", width: 12 }, { name: "Курс", width: 38 }, { name: "Модуль", width: 38 }, { name: "Бал, %", width: 10, totals: "average" }, { name: "Рекомендація", width: 48 }],
    weak.map((w) => [w.name, w.code, w.course, w.module, w.score, w.score < 50 ? "Критично — особиста розмова й повторне проходження модуля" : "Варто повторити модуль і переконатись у розумінні теми"])
  );
  weak.forEach((w, i) => {
    if (w.score < 50) for (let c = 1; c <= 6; c++) rec.getCell(i + 2, c).fill = solid(FAIL_FILL);
  });

  const assignments = ctx.wb.addWorksheet("Призначення");
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
    ex.enrollments.map((e) => [e.employee.name, e.employee.externalCode ?? "", e.course.title, statusLabel(e.status, e.passed), e.scorePercent ?? "", e.passed == null ? "" : e.passed ? "Так" : "Ні", fmtDate(e.assignedAt), fmtDate(e.dueDate), fmtDate(e.completedAt), fmtMinutes(e.durationSeconds), e.longestCorrectStreak || "", medalEmoji(e.scorePercent)])
  );
  passFill(assignments, 6, ex.enrollments.length);

  const attempts = ctx.wb.addWorksheet("Спроби");
  smartTable(
    attempts,
    "Attempts",
    [{ name: "Ім'я", width: 26 }, { name: "Код", width: 12 }, { name: "Курс", width: 38, totals: "count" }, { name: "Дата спроби", width: 13 }, { name: "Бал, %", width: 10, totals: "average" }, { name: "Складено", width: 10 }, { name: "Тривалість, хв", width: 14, totals: "average" }, { name: "Найдовша серія", width: 15 }, { name: "Медаль", width: 9 }],
    ex.attempts.map((a) => {
      const e = ctx.enrollmentById.get(a.enrollmentId);
      return [e?.employee.name ?? "", e?.employee.externalCode ?? "", e?.course.title ?? "", fmtDate(a.completedAt), a.scorePercent ?? "", a.passed ? "Так" : "Ні", fmtMinutes(a.durationSeconds), a.longestCorrectStreak ?? "", medalEmoji(a.scorePercent)];
    })
  );
  passFill(attempts, 6, ex.attempts.length);

  const modules = ctx.wb.addWorksheet("Модулі");
  smartTable(
    modules,
    "Modules",
    [{ name: "Ім'я", width: 26 }, { name: "Код", width: 12 }, { name: "Курс", width: 38, totals: "count" }, { name: "Модуль", width: 38 }, { name: "Бал, %", width: 10, totals: "average" }, { name: "Складено", width: 10 }, { name: "Дата", width: 13 }, { name: "Серія поспіль", width: 13 }, { name: "Медаль", width: 9 }],
    ex.moduleCompletions.map((m) => {
      const e = ctx.enrollmentById.get(m.enrollmentId);
      return [e?.employee.name ?? "", e?.employee.externalCode ?? "", e?.course.title ?? "", m.module.title, m.scorePercent ?? "", m.passed ? "Так" : "Ні", fmtDate(m.completedAt), m.longestCorrectStreak ?? "", medalEmoji(m.scorePercent)];
    })
  );
  passFill(modules, 6, ex.moduleCompletions.length);
}

/* ---------------- Збирання книги ---------------- */

export async function buildManagerReport(input: ReportInput): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CarLS";
  wb.created = input.generatedAt;
  // Формули зведення й підсумки таблиць — хай Excel перерахує при відкритті
  // (результати все одно записані).
  wb.calcProperties.fullCalcOnLoad = true;

  const groupBy = <T, K>(list: T[], key: (x: T) => K) => {
    const m = new Map<K, T[]>();
    for (const x of list) {
      const k = key(x);
      const arr = m.get(k) || [];
      arr.push(x);
      m.set(k, arr);
    }
    return m;
  };
  // Імена листів людей — наперед: на них посилаються зведення, команда й матриця.
  const taken = new Set(["Зведення", TEAM, MATRIX, COURSES, "Рекомендації", "Призначення", "Спроби", "Модулі"].map((s) => s.toLowerCase()));
  const personSheet = new Map<number, string>();
  const people = [...input.people].sort((a, b) => a.name.localeCompare(b.name, "uk"));
  for (const p of people) personSheet.set(p.id, sheetName(p.name, taken, p.externalCode ?? ""));

  const ctx: Ctx = {
    ...input,
    wb,
    personSheet,
    rowsByEmployee: groupBy(input.rows, (r) => r.employeeId),
    attemptsByEnrollment: groupBy(input.exportData.attempts, (a) => a.enrollmentId),
    modulesByEnrollment: groupBy(input.exportData.moduleCompletions, (m) => m.enrollmentId),
    enrollmentById: new Map(input.exportData.enrollments.map((e) => [e.id, e])),
  };

  buildSummary(ctx);
  buildTeam(ctx);
  buildMatrixSheet(ctx);
  buildCourses(ctx);
  for (const p of people) buildPerson(ctx, p);
  buildRawSheets(ctx);

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
