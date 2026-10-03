import type { PrismaClient } from "@/app/generated/prisma";
import { prisma as prismaUntyped } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { verifyExportToken } from "@/lib/exportLink";
import { isManagerTier, getAllSubordinates } from "@/lib/permissions";
import { getExportData, dashboardStatsFromRaw, getHardestQuestions, getTeamTree, weeklyTrendFromRaw } from "@/lib/managerDashboard";
import { fetchTeamRaw } from "@/lib/teamEnrollments";
import { buildPeople, buildTeamRows } from "@/lib/teamInsights";
import { buildManagerReport, parseCardIds } from "@/lib/managerReport";
import { fmtDate } from "@/lib/excelReport";

// GET /api/manager/export?cards=status,attention,… — Excel-звіт по видимій
// команді керівника. Склад і порядок листів приходять із дашборда (набір
// увімкнених карток у порядку керівника), без параметра — усі картки в
// канонічному порядку. Що саме на листах і чому так — lib/managerReport.ts.
//
// Дані рахуються тими самими функціями, що й дашборд (dashboardStatsFromRaw,
// weeklyTrendFromRaw, buildTeamRows/buildPeople), але без кешу
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


const prisma = prismaUntyped as PrismaClient;

/**
 * Хто завантажує: cookie-сесія або ключ `t` з посилання (lib/exportLink.ts) —
 * вікно з «Готово» на iPhone не має cookie застосунку. Ключ дійсний, лише
 * поки жива сесія, з якої його видали (sessionVersion), і людина активна.
 */
async function exportingEmployee(request: Request) {
  const fromToken = verifyExportToken(new URL(request.url).searchParams.get("t"));
  if (fromToken) {
    return prisma.employee.findFirst({
      where: { id: fromToken.employeeId, isActive: true, sessionVersion: fromToken.sessionVersion },
      select: { id: true, name: true, position: true },
    });
  }
  return getCurrentUser();
}

export async function GET(request: Request) {
  const employee = await exportingEmployee(request);
  if (!employee) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  if (!isManagerTier(employee)) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  const cardIds = parseCardIds(new URL(request.url).searchParams.get("cards"), CANONICAL_CARD_IDS);
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

  // inline=1 — iPhone (components/useExportLinkToken.ts): вікно Safari, яке
  // відкривається зі встановленого застосунку, не вміє завантажувати
  // (attachment) і лишалось порожнім; на перегляд (inline) iOS показує файл
  // сам — з «Готово» і «Відкрити в Excel». Решта — звичайне завантаження.
  const disposition = new URL(request.url).searchParams.get("inline") === "1" ? "inline" : "attachment";
  return new Response(new Blob([buffer as BlobPart]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `${disposition}; filename="zvit-komandy-${fmtDate(now)}.xlsx"`,
    },
  });
}
