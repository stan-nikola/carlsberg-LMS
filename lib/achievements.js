import { prisma } from "@/lib/prisma";
import { ensureAutoBadgesExist } from "@/lib/badgeRules";

/**
 * Усі типи ачивок + чи зароблена конкретним співробітником — для
 * AchievementsPanel.jsx (замінює попередній повністю хардкоджений список).
 * ensureAutoBadgesExist() — щоб авто-типи ("Перший вхід" тощо) були видні
 * навіть якщо cron ще жодного разу не прогнав нарахування.
 *
 * @param {number} employeeId
 * @returns {Promise<Array<{id:number,title:string,icon:string,description:string|null,kind:string,earned:boolean,awardedAt:Date|null}>>}
 */
export async function getEmployeeBadgesView(employeeId) {
  await ensureAutoBadgesExist();
  const [allBadges, awarded] = await Promise.all([
    prisma.badge.findMany({ orderBy: [{ kind: "asc" }, { title: "asc" }] }),
    prisma.employeeBadge.findMany({ where: { employeeId }, select: { badgeId: true, awardedAt: true } }),
  ]);
  const awardedByBadgeId = new Map(awarded.map((a) => [a.badgeId, a.awardedAt]));
  return allBadges.map((b) => ({
    id: b.id,
    title: b.title,
    icon: b.icon,
    description: b.description,
    kind: b.kind,
    earned: awardedByBadgeId.has(b.id),
    awardedAt: awardedByBadgeId.get(b.id) || null,
  }));
}

/**
 * Топ-N по середньому балу складених курсів у межах ОДНІЄЇ території —
 * реальний рейтинг замість фейкового "Ірина П. 980 XP". Свідомо середній
 * % бала, не lib/progress.js computeXp: той капується на 200 XP (2
 * завершені курси = максимум), а курсів у каталозі зараз лише 2 — всі,
 * хто пройшов обидва, вийшли б з однаковим XP і рейтинг не показував би
 * НІЧОГО. Середній бал — неперервна шкала, реально розрізняє людей.
 *
 * @param {number|null} territoryId
 * @param {number} limit
 * @returns {Promise<Array<{id:number,name:string,avgScore:number,coursesCount:number}>>}
 */
export async function getTerritoryLeaderboard(territoryId, limit = 3) {
  if (!territoryId) return [];

  const employees = await prisma.employee.findMany({
    where: { territoryId, isActive: true },
    select: {
      id: true,
      name: true,
      enrollments: {
        where: { status: "completed", passed: true },
        select: { scorePercent: true },
      },
    },
  });

  return employees
    .map((e) => {
      const scores = e.enrollments.map((x) => x.scorePercent).filter((s) => s != null);
      if (scores.length === 0) return null;
      const avgScore = Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length);
      return { id: e.id, name: e.name, avgScore, coursesCount: scores.length };
    })
    .filter(Boolean)
    .sort((a, b) => b.avgScore - a.avgScore || b.coursesCount - a.coursesCount)
    .slice(0, limit);
}
