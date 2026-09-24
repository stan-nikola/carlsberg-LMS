import sharp from "sharp";
import { getCurrentUser } from "@/lib/session";
import { isManagerTier, getAllSubordinates } from "@/lib/permissions";
import { getExportData, getDashboardStats, getHardestQuestions, getTeamTree, getWeeklyTrend } from "@/lib/managerDashboard";
import { fetchTeamRaw } from "@/lib/teamEnrollments";
import { buildPeople, buildTeamRows } from "@/lib/teamInsights";
import { buildManagerReport, parseCardIds } from "@/lib/managerReport";
import { fmtDate } from "@/lib/excelReport";

// GET /api/manager/export?cards=status,attention,… — Excel-звіт по видимій
// команді керівника. Склад і порядок листів приходять із дашборда (набір
// увімкнених карток у порядку керівника), без параметра — усі картки в
// канонічному порядку. Що саме на листах і чому так — lib/managerReport.ts.
//
// Дані рахуються тими самими функціями, що й дашборд (getDashboardStats,
// getWeeklyTrend, buildTeamRows/buildPeople), але без кешу
// getManagerOverview: "use cache: private" живе в рендері сторінки, а
// звіт — одноразове завантаження, свіжі дані тут важливіші за секунду.

const CANONICAL_CARD_IDS = [
  "status",
  "attention",
  "rings",
  "trend",
  "deadlines",
  "scoreDist",
  "firstTry",
  "duration",
  "courseBreakdown",
  "hardestModules",
  "peopleStatus",
  "teamCompare",
  "hardestQuestions",
];

// density 192 — удвічі щільніше за екранні 96 dpi: картинка в Excel
// масштабується під зум, і на 100% лінії кілець без цього мильні.
const rasterize = async (svg: string) => new Uint8Array(await sharp(Buffer.from(svg), { density: 192 }).png().toBuffer());

export async function GET(request: Request) {
  const employee = await getCurrentUser();
  if (!employee) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  if (!isManagerTier(employee)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  const cardIds = parseCardIds(new URL(request.url).searchParams.get("cards"), CANONICAL_CARD_IDS);
  const subordinateIds: number[] = await getAllSubordinates(employee.id);
  const now = new Date();

  const [exportData, stats, weeklyTrend, raw, teamTree, hardestQuestions] = await Promise.all([
    getExportData(subordinateIds),
    getDashboardStats(subordinateIds),
    getWeeklyTrend(subordinateIds),
    fetchTeamRaw(subordinateIds),
    getTeamTree(employee.id),
    getHardestQuestions(subordinateIds),
  ]);
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
    rasterize,
  });

  return new Response(new Blob([buffer as BlobPart]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="zvit-komandy-${fmtDate(now)}.xlsx"`,
    },
  });
}
