import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildManagerReport, compareTeams, parseCardIds, CARD_SHEETS, type ReportInput } from "./managerReport";
import type { PersonCounts, TeamPerson, TeamRow } from "./teamInsights";

const counts = (over: Partial<PersonCounts> = {}): PersonCounts => ({ total: 0, completed: 0, overdue: 0, inProgress: 0, notStarted: 0, failed: 0, behind: 0, avgScore: null, ...over });

describe("compareTeams", () => {
  it("рахує піддерево кожного прямого підлеглого й сортує за часткою", () => {
    const tree = [
      { id: 1, name: "СВ Іван", children: [{ id: 11, name: "ТП", children: [] }] },
      { id: 2, name: "СВ Олена", children: [] },
      { id: 3, name: "Без призначень", children: [] },
    ];
    const map = new Map<number, PersonCounts>([
      [1, counts({ total: 2, completed: 1 })],
      [11, counts({ total: 2, completed: 2, overdue: 1 })],
      [2, counts({ total: 4, completed: 4 })],
    ]);
    const out = compareTeams(tree, map);
    expect(out.map((t) => [t.name, t.pct, t.total, t.overdue])).toEqual([
      ["СВ Олена", 100, 4, 0],
      ["СВ Іван", 75, 4, 1],
    ]);
  });
});

describe("parseCardIds", () => {
  it("бере лише відомі картки в переданому порядку, інакше — канонічні", () => {
    const canonical = ["status", "rings", "trend"];
    expect(parseCardIds("trend,bogus,status,status", canonical)).toEqual(["trend", "status"]);
    expect(parseCardIds("", canonical)).toEqual(canonical);
    expect(parseCardIds("bogus", canonical)).toEqual(canonical);
  });
});

function person(id: number, over: Partial<TeamPerson> = {}): TeamPerson {
  return {
    id,
    name: `Особа ${id}`,
    externalCode: `TP${id}`,
    avatarUrl: null,
    positionCode: "TP",
    positionName: "ТП",
    positionLevel: 4,
    managerId: 100,
    lastSeenAt: null,
    lastSeenLabel: "щойно",
    inactive: false,
    segment: "on_track",
    counts: counts({ total: 1, completed: 1 }),
    urgency: 0,
    activeWeeks: [],
    ...over,
  };
}

function row(over: Partial<TeamRow> = {}): TeamRow {
  return {
    enrollmentId: 1,
    employeeId: 1,
    employeeName: "Особа 1",
    courseId: 10,
    courseSlug: "c",
    courseTitle: "Курс",
    isMandatory: true,
    status: "completed",
    passed: true,
    scorePercent: 95,
    assignedAt: "2026-09-01",
    dueDate: null,
    dueDateLabel: null,
    completedAt: "2026-09-10",
    completedAtLabel: "10.09.2026",
    isOverdue: false,
    isLate: false,
    schedule: null,
    failedModuleIds: [],
    modulesPassed: 1,
    modulesTotal: 1,
    cell: "passed",
    ...over,
  };
}

describe("buildManagerReport", () => {
  it("будує книгу: зведення, лист на кожну обрану картку в її порядку, деталізація", async () => {
    const rasterized: string[] = [];
    const input: ReportInput = {
      managerName: "Керівник",
      generatedAt: new Date("2026-09-24T10:00:00Z"),
      cardIds: ["deadlines", "status", "peopleStatus"],
      stats: {
        teamSize: 1,
        completionRate: 100,
        passRate: 100,
        onTimeRate: 100,
        startedRate: 100,
        avgScore: 95,
        overdueCount: 0,
        courseBreakdown: [{ id: 10, slug: "c", title: "Курс", total: 1, completed: 1, pct: 100 }],
        deadlineHorizon: [{ key: "overdue", label: "Прострочено", count: 0, alert: true }, { key: "none", label: "Без дедлайну", count: 0 }],
        scoreDistribution: [{ key: "s90", label: "90–99%", count: 1 }],
        hardestModules: [],
        firstAttempt: { total: 1, passedFirst: 1, retried: 0, pct: 100 },
        durations: { total: 1, medianSeconds: 600, medianActiveSeconds: null, buckets: [{ key: "lt10", label: "до 10 хв", count: 1 }] },
      },
      weeklyTrend: [{ label: "Цей тиждень", count: 1, people: [{ name: "Особа 1", count: 1 }] }],
      people: [person(1)],
      rows: [row()],
      teamTree: [{ id: 1, name: "Особа 1", children: [] }],
      hardestQuestions: [],
      exportData: {
        employees: [{ id: 1, name: "Особа 1", externalCode: "TP1", position: { name: "ТП" }, territory: null }],
        enrollments: [
          { id: 1, employeeId: 1, status: "completed", passed: true, scorePercent: 95, assignedAt: "2026-09-01", dueDate: null, completedAt: "2026-09-10", durationSeconds: 600, longestCorrectStreak: 3, employee: { name: "Особа 1", externalCode: "TP1" }, course: { title: "Курс" } },
        ],
        attempts: [{ enrollmentId: 1, completedAt: "2026-09-10", scorePercent: 95, passed: true, durationSeconds: 600, longestCorrectStreak: 3 }],
        moduleCompletions: [{ enrollmentId: 1, passed: false, scorePercent: 40, completedAt: "2026-09-09", longestCorrectStreak: 1, module: { title: "Модуль 1" } }],
      },
      rasterize: async (svg) => {
        rasterized.push(svg);
        // 1×1 PNG — exceljs лише кладе байти, не декодує.
        return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
      },
    };
    const buffer = await buildManagerReport(input);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(["Зведення", CARD_SHEETS.deadlines.title, CARD_SHEETS.status.title, CARD_SHEETS.peopleStatus.title, "Рекомендації", "Команда", "Призначення", "Спроби", "Модулі"]);

    // Зведення: формула + записаний результат.
    const kpi = wb.getWorksheet("Зведення")!.getCell("B6").value as ExcelJS.CellFormulaValue;
    expect(kpi.formula).toContain("COUNTA('Призначення'!C2:C2)");
    expect(kpi.result).toBe(1);

    // Матриця: ✓ у клітинці людини × курсу.
    const matrix = wb.getWorksheet(CARD_SHEETS.peopleStatus.title)!;
    expect(matrix.getCell("A5").value).toBe("Особа 1");
    expect(matrix.getCell("B5").value).toBe("✓");

    // Діаграми растеризувались лише для карток із діаграмою (дедлайни, стан).
    expect(rasterized.length).toBe(2);
    expect(rasterized.every((s) => s.startsWith("<svg"))).toBe(true);

    // Розумна таблиця з підсумками на листі деталізації.
    const assignments = wb.getWorksheet("Призначення")!;
    expect(assignments.getTable("Assignments")).toBeDefined();
    expect(assignments.getCell("A1").value).toBe("Ім'я");
  });
});
