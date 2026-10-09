import { requireManager } from "@/lib/session";
import { auditEmployee } from "@/lib/audit";
import { getAllSubordinates } from "@/lib/permissions";
import { getExportData, dashboardStatsFromRaw, getHardestQuestions, getTeamTree, weeklyTrendFromRaw } from "@/lib/managerDashboard";
import { fetchTeamRaw } from "@/lib/teamEnrollments";
import { buildPeople, buildTeamRows } from "@/lib/teamInsights";
import { buildManagerReport, parseCardIds } from "@/lib/managerReport";
import { fmtDate, xlsxResponse } from "@/lib/excelReport";

// GET /api/manager/export?cards=status,attention,… — Excel-звіт по видимій
// команді керівника. Склад і порядок листів приходять із дашборда (набір
// увімкнених карток у порядку керівника), без параметра — усі картки в
// канонічному порядку. Що саме на листах і чому так — lib/managerReport.ts.
//
// Дані рахуються тими самими функціями, що й дашборд (dashboardStatsFromRaw,
// weeklyTrendFromRaw, buildTeamRows/buildPeople), але без кешу
// getManagerOverview: "use cache: private" живе в рендері сторінки, а
// звіт — одноразове завантаження, свіжі дані тут важливіші за секунду.

// Той самий порядок, що CANONICAL_CARD_IDS у components/ManagerDashboard.jsx.
const CANONICAL_CARD_IDS = [
  "rings",
  "attention",
  "status",
  "deadlines",
  "scoreDist",
  "peopleStatus",
  "trend",
  "firstTry",
  "duration",
  "courseBreakdown",
  "hardestModules",
  "teamCompare",
  "hardestQuestions",
];


export async function GET(request: Request) {
  const { manager: employee, denied } = await requireManager();
  if (denied) return denied;

  const cardIds = parseCardIds(new URL(request.url).searchParams.get("cards"), CANONICAL_CARD_IDS);
  auditEmployee(employee.id, "manager.export", undefined, { cards: cardIds.length });
  const subordinateIds: number[] = await getAllSubordinates(employee.id);
  const now = new Date();

  const [exportData, raw, teamTree, hardestQuestions] = await Promise.all([
    getExportData(subordinateIds),
    fetchTeamRaw(subordinateIds),
    getTeamTree(employee.id),
    getHardestQuestions(subordinateIds),
  ]);
  const stats = dashboardStatsFromRaw(raw, subordinateIds.length);
  const weeklyTrend = weeklyTrendFromRaw(raw, now);
  const rows = buildTeamRows(raw, now);
  const people = buildPeople(rows, raw, now);

  const buffer = await buildManagerReport({
    managerName: employee.name,
    generatedAt: now,
    cardIds,
    stats,
    weeklyTrend,
    people,
    rows,
    teamTree,
    hardestQuestions,
    exportData,
  });

  return xlsxResponse(buffer, `zvit-komandy-${fmtDate(now)}.xlsx`);
}
